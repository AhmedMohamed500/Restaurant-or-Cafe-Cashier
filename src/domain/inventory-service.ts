"use client";

import { db } from "@/src/db/database";
import type { ProductionOrder, SaleOrder, StockBalance, StockMovement } from "./models";
import { multiplyMoney, roundQuantity } from "@/src/lib/money";

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

export function convertUnit(quantity: number, fromFactor: number, toFactor: number) {
  if (fromFactor <= 0 || toFactor <= 0) throw new Error("معامل التحويل يجب أن يكون أكبر من صفر");
  return roundQuantity((quantity * fromFactor) / toFactor);
}

async function getBalance(warehouseId: string, itemId: string): Promise<StockBalance> {
  return (await db.balances.get(`${warehouseId}:${itemId}`)) ?? {
    id: `${warehouseId}:${itemId}`,
    warehouseId,
    itemId,
    quantity: 0,
    reserved: 0,
    averageCostPiasters: 0,
    updatedAt: now(),
  };
}

export async function calculateRecipeCost(recipeId: string, multiplier = 1) {
  const recipe = await db.recipes.get(recipeId);
  if (!recipe) throw new Error("الوصفة غير موجودة");
  let total = 0;
  for (const ingredient of recipe.ingredients) {
    const item = await db.items.get(ingredient.itemId);
    if (!item) throw new Error("أحد مكونات الوصفة غير موجود");
    const required = ingredient.quantity * multiplier * (1 + ingredient.wastePercent / 100);
    total += multiplyMoney(item.averageCostPiasters, required);
  }
  return total;
}

export async function addOpeningStock(input: {
  warehouseId: string;
  itemId: string;
  quantity: number;
  unitCostPiasters: number;
  note?: string;
}) {
  return db.transaction("rw", [db.items, db.balances, db.movements], async () => {
    if (input.quantity <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر");
    if (input.unitCostPiasters < 0) throw new Error("التكلفة لا يمكن أن تكون سالبة");
    const item = await db.items.get(input.itemId);
    if (!item) throw new Error("المادة غير موجودة");
    const balance = await getBalance(input.warehouseId, input.itemId);
    const oldValue = multiplyMoney(balance.averageCostPiasters, balance.quantity);
    const addedValue = multiplyMoney(input.unitCostPiasters, input.quantity);
    const newQuantity = roundQuantity(balance.quantity + input.quantity);
    const averageCostPiasters = newQuantity ? Math.round((oldValue + addedValue) / newQuantity) : input.unitCostPiasters;
    const timestamp = now();
    await db.balances.put({ ...balance, quantity: newQuantity, averageCostPiasters, updatedAt: timestamp });
    await db.items.update(item.id, { averageCostPiasters, updatedAt: timestamp });
    const movement: StockMovement = {
      id: uid(), warehouseId: input.warehouseId, itemId: input.itemId, type: "opening",
      quantity: input.quantity, unitCostPiasters: input.unitCostPiasters,
      totalCostPiasters: addedValue, reference: `OPEN-${Date.now().toString().slice(-6)}`,
      note: input.note, createdAt: timestamp, updatedAt: timestamp, createdBy: "local-user",
    };
    await db.movements.put(movement);
    return movement;
  });
}

export async function executeProduction(input: {
  recipeId: string;
  batches: number;
  actualQuantity?: number;
  sourceWarehouseId: string;
  targetWarehouseId: string;
}) {
  return db.transaction("rw", [db.recipes, db.items, db.balances, db.movements, db.productionOrders], async () => {
    const recipe = await db.recipes.get(input.recipeId);
    if (!recipe) throw new Error("الوصفة غير موجودة");
    if (input.batches <= 0) throw new Error("عدد دفعات الإنتاج غير صحيح");

    const requirements = await Promise.all(recipe.ingredients.filter((x) => !x.optional).map(async (ingredient) => {
      const balance = await getBalance(input.sourceWarehouseId, ingredient.itemId);
      const required = roundQuantity(ingredient.quantity * input.batches * (1 + ingredient.wastePercent / 100));
      if (balance.quantity - balance.reserved < required) {
        const item = await db.items.get(ingredient.itemId);
        throw new Error(`الرصيد غير كافٍ: ${item?.nameAr ?? ingredient.itemId}`);
      }
      return { ingredient, balance, required };
    }));

    const productionId = uid();
    const reference = `MO-${Date.now().toString().slice(-6)}`;
    let totalCost = 0;
    const movements: StockMovement[] = [];

    for (const req of requirements) {
      const item = await db.items.get(req.ingredient.itemId);
      const cost = item?.averageCostPiasters ?? req.balance.averageCostPiasters;
      totalCost += multiplyMoney(cost, req.required);
      await db.balances.put({ ...req.balance, quantity: roundQuantity(req.balance.quantity - req.required), updatedAt: now() });
      movements.push({
        id: uid(), warehouseId: input.sourceWarehouseId, itemId: req.ingredient.itemId,
        type: "production_consume", quantity: -req.required, unitCostPiasters: cost,
        totalCostPiasters: -multiplyMoney(cost, req.required), reference, createdAt: now(), updatedAt: now(), createdBy: "local-user",
      });
    }

    const actualQuantity = input.actualQuantity ?? recipe.outputQuantity * input.batches;
    if (actualQuantity <= 0) throw new Error("الكمية الفعلية يجب أن تكون أكبر من صفر");
    const outputBalance = await getBalance(input.targetWarehouseId, recipe.outputItemId);
    const oldValue = multiplyMoney(outputBalance.averageCostPiasters, outputBalance.quantity);
    const newQuantity = roundQuantity(outputBalance.quantity + actualQuantity);
    const unitCost = Math.round(totalCost / actualQuantity);
    await db.balances.put({
      ...outputBalance,
      quantity: newQuantity,
      averageCostPiasters: newQuantity ? Math.round((oldValue + totalCost) / newQuantity) : unitCost,
      updatedAt: now(),
    });
    await db.items.update(recipe.outputItemId, { averageCostPiasters: unitCost, updatedAt: now() });
    movements.push({
      id: uid(), warehouseId: input.targetWarehouseId, itemId: recipe.outputItemId,
      type: "production_output", quantity: actualQuantity, unitCostPiasters: unitCost,
      totalCostPiasters: totalCost, reference, createdAt: now(), updatedAt: now(), createdBy: "local-user",
    });
    await db.movements.bulkPut(movements);

    const planned = recipe.outputQuantity * input.batches;
    const order: ProductionOrder = {
      id: productionId, number: reference, recipeId: recipe.id, plannedQuantity: planned,
      actualQuantity, sourceWarehouseId: input.sourceWarehouseId, targetWarehouseId: input.targetWarehouseId,
      status: "completed", totalCostPiasters: totalCost, unitCostPiasters: unitCost,
      wasteQuantity: Math.max(0, planned - actualQuantity),
      createdAt: now(), updatedAt: now(), createdBy: "local-user",
    };
    await db.productionOrders.put(order);
    return order;
  });
}

export async function completeSale(order: Omit<SaleOrder, "id" | "number" | "status" | "createdAt" | "updatedAt" | "createdBy">) {
  return db.transaction("rw", [db.settings, db.saleOrders, db.items, db.recipes, db.balances, db.movements], async () => {
    const settings = await db.settings.get("settings");
    if (!settings?.activeShift) throw new Error("يجب فتح وردية قبل تسجيل المبيعات");
    const saleId = uid();
    const reference = `INV-${Date.now().toString().slice(-6)}`;
    const movements: StockMovement[] = [];

    for (const line of order.items) {
      const recipe = await db.recipes.where("outputItemId").equals(line.itemId).first();
      if (!recipe) continue;
      for (const ingredient of recipe.ingredients.filter((x) => !x.optional)) {
        const item = await db.items.get(ingredient.itemId);
        if (!item) continue;
        const warehouseId = item.stage === "raw" ? "wh-raw" : item.stage === "work_in_progress" ? "wh-wip" : "wh-fg";
        const balance = await getBalance(warehouseId, ingredient.itemId);
        const required = roundQuantity(ingredient.quantity * line.quantity);
        if (balance.quantity - balance.reserved < required) throw new Error(`الرصيد غير كافٍ لإتمام الطلب: ${item.nameAr}`);
        await db.balances.put({ ...balance, quantity: roundQuantity(balance.quantity - required), updatedAt: now() });
        movements.push({
          id: uid(), warehouseId, itemId: item.id, type: "sale", quantity: -required,
          unitCostPiasters: item.averageCostPiasters, totalCostPiasters: -multiplyMoney(item.averageCostPiasters, required),
          reference, createdAt: now(), updatedAt: now(), createdBy: "local-cashier",
        });
      }
    }
    await db.movements.bulkPut(movements);
    const sale: SaleOrder = {
      ...order, id: saleId, number: reference, status: "paid",
      createdAt: now(), updatedAt: now(), createdBy: "local-cashier",
    };
    await db.saleOrders.put(sale);
    return sale;
  });
}
