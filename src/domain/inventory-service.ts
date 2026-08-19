"use client";

import { db } from "@/src/db/database";
import type {
  InventoryItem,
  ItemStage,
  ProductionOrder,
  Recipe,
  SaleOrder,
  StockBalance,
  StockMovement,
  UnitOfMeasure,
  Warehouse,
} from "./models";
import { multiplyMoney, roundQuantity } from "@/src/lib/money";
import { assertCompatibleUnitFamilies, convertUnitQuantity, normalizeRecipeMassQuantity } from "@/src/lib/units";
import { postInventoryReceipt, postInventoryToKitchenTransfer, postProductionOrder, postSaleOrder } from "./accounting-service";

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const actor = "local-user";

export function convertUnit(quantity: number, fromFactor: number, toFactor: number) {
  return convertUnitQuantity(quantity, fromFactor, toFactor);
}

export function ensureSameUnitFamily(from: Pick<UnitOfMeasure, "family">, to: Pick<UnitOfMeasure, "family">) {
  assertCompatibleUnitFamilies(from.family, to.family);
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

async function activeWarehouse(stage: ItemStage): Promise<Warehouse> {
  const warehouse = await db.warehouses.where("stage").equals(stage).filter((entry) => entry.active).first();
  if (!warehouse) throw new Error(stage === "raw" ? "المخزن الرئيسي غير موجود" : stage === "work_in_progress" ? "مخزن المطبخ غير موجود" : "مخزن المنتج التام غير موجود");
  return warehouse;
}

async function quantityInBase(item: InventoryItem, enteredUnitId: string, enteredQuantity: number) {
  const [enteredUnit, baseUnit] = await Promise.all([db.units.get(enteredUnitId), db.units.get(item.baseUnitId)]);
  if (!enteredUnit || !baseUnit) throw new Error("وحدة القياس غير موجودة");
  ensureSameUnitFamily(enteredUnit, baseUnit);
  return { quantityBase: convertUnit(enteredQuantity, enteredUnit.baseFactor, baseUnit.baseFactor), enteredUnit, baseUnit };
}

async function normalizeRecipeIngredientsToGrams(ingredients: Recipe["ingredients"]) {
  const gramUnit = await db.units.where("code").equals("G").first();
  if (!gramUnit) throw new Error("وحدة الجرام غير موجودة");
  return Promise.all(ingredients.map(async (ingredient) => {
    const unit = await db.units.get(ingredient.unitId);
    if (!unit) throw new Error("وحدة أحد مكونات الوصفة غير موجودة");
    if (unit.family !== "mass") return ingredient;
    return { ...ingredient, quantity: normalizeRecipeMassQuantity(ingredient.quantity, unit.family, unit.baseFactor), unitId: gramUnit.id };
  }));
}

export async function calculateRecipeCost(recipeId: string, multiplier = 1) {
  const recipe = await db.recipes.get(recipeId);
  if (!recipe) throw new Error("الوصفة غير موجودة");
  let total = 0;
  for (const ingredient of recipe.ingredients) {
    const item = await db.items.get(ingredient.itemId);
    if (!item) throw new Error("أحد مكونات الوصفة غير موجود");
    const converted = await quantityInBase(item, ingredient.unitId, ingredient.quantity * multiplier * (1 + ingredient.wastePercent / 100));
    total += multiplyMoney(item.averageCostPiasters, converted.quantityBase);
  }
  return total;
}

export async function addOpeningStock(input: {
  warehouseId?: string;
  itemId?: string;
  newItem?: Pick<InventoryItem, "code" | "nameAr" | "nameEn" | "category" | "minLevel" | "imageDataUrl">;
  quantity: number;
  enteredUnitId?: string;
  unitCostPiasters: number;
  reference?: string;
  note?: string;
}) {
  return db.transaction("rw", [db.units, db.items, db.warehouses, db.balances, db.movements, db.accounts, db.journalEntries, db.journalLines], async () => {
    if (input.unitCostPiasters < 0) throw new Error("التكلفة لا يمكن أن تكون سالبة");
    const enteredUnit = await db.units.get(input.enteredUnitId ?? "");
    let item = input.itemId ? await db.items.get(input.itemId) : undefined;
    if (!item && input.newItem) {
      if (!enteredUnit) throw new Error("وحدة القياس غير موجودة");
      const baseUnit = (await db.units.where("family").equals(enteredUnit.family).toArray()).sort((a, b) => a.baseFactor - b.baseFactor)[0];
      if (!baseUnit) throw new Error("الوحدة الأساسية غير موجودة");
      const timestamp = now();
      item = {
        id: uid(), code: input.newItem.code.toUpperCase(), nameAr: input.newItem.nameAr, nameEn: input.newItem.nameEn,
        category: input.newItem.category, stage: "raw", baseUnitId: baseUnit.id, purchaseUnitId: enteredUnit.id,
        purchaseFactor: enteredUnit.baseFactor / baseUnit.baseFactor, minLevel: input.newItem.minLevel,
        averageCostPiasters: 0, imageDataUrl: input.newItem.imageDataUrl, active: true,
        createdAt: timestamp, updatedAt: timestamp, createdBy: actor,
      };
      await db.items.add(item);
    }
    if (!item) throw new Error("المادة غير موجودة");
    const warehouse = input.warehouseId ? await db.warehouses.get(input.warehouseId) : await activeWarehouse("raw");
    if (!warehouse || warehouse.stage !== "raw") throw new Error("إذن الإضافة متاح للمخزن الرئيسي فقط");
    const enteredUnitId = input.enteredUnitId ?? item.baseUnitId;
    const { quantityBase } = await quantityInBase(item, enteredUnitId, input.quantity);
    const balance = await getBalance(warehouse.id, item.id);
    const totalCostPiasters = multiplyMoney(input.unitCostPiasters, input.quantity);
    const baseUnitCost = Math.round(totalCostPiasters / quantityBase);
    const oldValue = multiplyMoney(balance.averageCostPiasters, balance.quantity);
    const newQuantity = roundQuantity(balance.quantity + quantityBase);
    const averageCostPiasters = newQuantity ? Math.round((oldValue + totalCostPiasters) / newQuantity) : baseUnitCost;
    const timestamp = now();
    await db.balances.put({ ...balance, quantity: newQuantity, averageCostPiasters, updatedAt: timestamp });
    await db.items.update(item.id, { averageCostPiasters, purchaseUnitId: enteredUnitId, purchaseFactor: quantityBase / input.quantity, updatedAt: timestamp });
    const movement: StockMovement = {
      id: uid(), warehouseId: warehouse.id, destinationWarehouseId: warehouse.id, itemId: item.id, type: "stock_receipt",
      quantity: quantityBase, enteredQuantity: input.quantity, enteredUnitId, unitCostPiasters: baseUnitCost,
      totalCostPiasters, reference: input.reference?.trim() || `REC-${Date.now().toString().slice(-8)}`,
      note: input.note, createdAt: timestamp, updatedAt: timestamp, createdBy: actor,
    };
    await db.movements.put(movement);
    await postInventoryReceipt(movement.id, movement.reference, totalCostPiasters);
    return movement;
  });
}

export async function transferToKitchen(input: {
  itemId: string;
  quantity: number;
  enteredUnitId: string;
  reference?: string;
  note?: string;
}) {
  return db.transaction("rw", [db.units, db.items, db.warehouses, db.balances, db.movements, db.accounts, db.journalEntries, db.journalLines], async () => {
    const item = await db.items.get(input.itemId);
    if (!item || item.stage === "finished") throw new Error("اختر مادة خام صالحة للتحويل");
    const [source, destination] = await Promise.all([activeWarehouse("raw"), activeWarehouse("work_in_progress")]);
    const { quantityBase } = await quantityInBase(item, input.enteredUnitId, input.quantity);
    const [sourceBalance, destinationBalance] = await Promise.all([getBalance(source.id, item.id), getBalance(destination.id, item.id)]);
    const available = roundQuantity(sourceBalance.quantity - sourceBalance.reserved);
    if (available < quantityBase) throw new Error(`الرصيد غير كافٍ: المطلوب ${quantityBase} والمتاح ${available} بالوحدة الأساسية`);
    const timestamp = now();
    const reference = input.reference?.trim() || `TR-${Date.now().toString().slice(-8)}`;
    const cost = sourceBalance.averageCostPiasters || item.averageCostPiasters;
    const transferredValue = multiplyMoney(cost, quantityBase);
    const destinationOldValue = multiplyMoney(destinationBalance.averageCostPiasters, destinationBalance.quantity);
    const destinationQuantity = roundQuantity(destinationBalance.quantity + quantityBase);
    await db.balances.bulkPut([
      { ...sourceBalance, quantity: roundQuantity(sourceBalance.quantity - quantityBase), updatedAt: timestamp },
      { ...destinationBalance, quantity: destinationQuantity, averageCostPiasters: destinationQuantity ? Math.round((destinationOldValue + transferredValue) / destinationQuantity) : cost, updatedAt: timestamp },
    ]);
    const common = { itemId: item.id, enteredQuantity: input.quantity, enteredUnitId: input.enteredUnitId, unitCostPiasters: cost, reference, note: input.note, createdAt: timestamp, updatedAt: timestamp, createdBy: actor };
    const movements: StockMovement[] = [
      { ...common, id: uid(), warehouseId: source.id, sourceWarehouseId: source.id, destinationWarehouseId: destination.id, type: "transfer_to_kitchen_out", quantity: -quantityBase, totalCostPiasters: -transferredValue },
      { ...common, id: uid(), warehouseId: destination.id, sourceWarehouseId: source.id, destinationWarehouseId: destination.id, type: "transfer_to_kitchen_in", quantity: quantityBase, totalCostPiasters: transferredValue },
    ];
    await db.movements.bulkPut(movements);
    await postInventoryToKitchenTransfer(reference, reference, transferredValue);
    return movements;
  });
}

export async function executeProduction(input: {
  recipeId: string;
  batches: number;
  actualQuantity?: number;
  sourceWarehouseId?: string;
  targetWarehouseId?: string;
}) {
  return db.transaction("rw", [db.units, db.recipes, db.items, db.warehouses, db.balances, db.movements, db.productionOrders, db.accounts, db.journalEntries, db.journalLines, db.auditLogs], async () => {
    const recipe = await db.recipes.get(input.recipeId);
    if (!recipe) throw new Error("أمر التصنيع غير موجود");
    const normalizedIngredients = await normalizeRecipeIngredientsToGrams(recipe.ingredients);
    const normalizedRecipe = { ...recipe, ingredients: normalizedIngredients };
    if (normalizedIngredients.some((ingredient, index) => ingredient.quantity !== recipe.ingredients[index].quantity || ingredient.unitId !== recipe.ingredients[index].unitId)) {
      await db.recipes.update(recipe.id, { ingredients: normalizedIngredients, updatedAt: now() });
    }
    if (input.batches <= 0) throw new Error("عدد دفعات الإنتاج غير صحيح");
    const [kitchen, finishedWarehouse] = await Promise.all([activeWarehouse("work_in_progress"), activeWarehouse("finished")]);
    const sourceWarehouseId = input.sourceWarehouseId ?? kitchen.id;
    const targetWarehouseId = input.targetWarehouseId ?? finishedWarehouse.id;
    if (sourceWarehouseId !== kitchen.id) throw new Error("التصنيع يسحب مكوناته من رصيد المطبخ فقط");
    if (targetWarehouseId !== finishedWarehouse.id) throw new Error("ناتج التصنيع يجب أن يضاف إلى المنتج التام");

    const requirements = [];
    for (const ingredient of normalizedRecipe.ingredients.filter((entry) => !entry.optional)) {
      const item = await db.items.get(ingredient.itemId);
      if (!item) throw new Error("أحد مكونات التصنيع غير موجود");
      const enteredQuantity = roundQuantity(ingredient.quantity * input.batches * (1 + ingredient.wastePercent / 100));
      const { quantityBase } = await quantityInBase(item, ingredient.unitId, enteredQuantity);
      const balance = await getBalance(kitchen.id, ingredient.itemId);
      const available = roundQuantity(balance.quantity - balance.reserved);
      if (available < quantityBase) {
        const shortage = roundQuantity(quantityBase - available);
        throw new Error(`${item.nameAr}: المطلوب ${quantityBase}، المتاح ${available}، العجز ${shortage}`);
      }
      requirements.push({ ingredient, item, balance, quantityBase, enteredQuantity });
    }

    const outputItem = await db.items.get(normalizedRecipe.outputItemId);
    if (!outputItem || outputItem.stage !== "finished") throw new Error("يجب أن يكون ناتج التصنيع منتجًا تامًا");
    const actualEntered = input.actualQuantity ?? normalizedRecipe.outputQuantity * input.batches;
    const outputConversion = await quantityInBase(outputItem, normalizedRecipe.outputUnitId, actualEntered);
    const actualQuantity = outputConversion.quantityBase;
    const reference = `MO-${Date.now().toString().slice(-8)}`;
    const timestamp = now();
    let totalCost = 0;
    const movements: StockMovement[] = [];

    for (const requirement of requirements) {
      const cost = requirement.balance.averageCostPiasters || requirement.item.averageCostPiasters;
      const value = multiplyMoney(cost, requirement.quantityBase);
      totalCost += value;
      await db.balances.put({ ...requirement.balance, quantity: roundQuantity(requirement.balance.quantity - requirement.quantityBase), updatedAt: timestamp });
      movements.push({
        id: uid(), warehouseId: kitchen.id, sourceWarehouseId: kitchen.id, itemId: requirement.item.id,
        type: "production_consume", quantity: -requirement.quantityBase, enteredQuantity: requirement.enteredQuantity,
        enteredUnitId: requirement.ingredient.unitId, unitCostPiasters: cost, totalCostPiasters: -value,
        reference, createdAt: timestamp, updatedAt: timestamp, createdBy: actor,
      });
    }

    const outputBalance = await getBalance(finishedWarehouse.id, outputItem.id);
    const oldValue = multiplyMoney(outputBalance.averageCostPiasters, outputBalance.quantity);
    const newQuantity = roundQuantity(outputBalance.quantity + actualQuantity);
    const unitCost = Math.round(totalCost / actualQuantity);
    const newAverageCost = newQuantity ? Math.round((oldValue + totalCost) / newQuantity) : unitCost;
    await db.balances.put({ ...outputBalance, quantity: newQuantity, averageCostPiasters: newAverageCost, updatedAt: timestamp });
    await db.items.update(outputItem.id, { averageCostPiasters: newAverageCost, salePricePiasters: recipe.sellingPricePiasters ?? outputItem.salePricePiasters, updatedAt: timestamp });
    movements.push({
      id: uid(), warehouseId: finishedWarehouse.id, destinationWarehouseId: finishedWarehouse.id, itemId: outputItem.id,
      type: "production_output", quantity: actualQuantity, enteredQuantity: actualEntered, enteredUnitId: normalizedRecipe.outputUnitId,
      unitCostPiasters: unitCost, totalCostPiasters: totalCost, reference, createdAt: timestamp, updatedAt: timestamp, createdBy: actor,
    });
    await db.movements.bulkPut(movements);

    const plannedConversion = await quantityInBase(outputItem, normalizedRecipe.outputUnitId, normalizedRecipe.outputQuantity * input.batches);
    const order: ProductionOrder = {
      id: uid(), number: reference, recipeId: recipe.id, plannedQuantity: plannedConversion.quantityBase,
      actualQuantity, sourceWarehouseId: kitchen.id, targetWarehouseId: finishedWarehouse.id,
      status: "completed", totalCostPiasters: totalCost, unitCostPiasters: unitCost,
      wasteQuantity: Math.max(0, roundQuantity(plannedConversion.quantityBase - actualQuantity)),
      createdAt: timestamp, updatedAt: timestamp, createdBy: actor,
    };
    await db.productionOrders.put(order);
    await postProductionOrder(order.id, order.number, totalCost);
    await db.auditLogs.add({id:uid(),action:"production_complete",entityType:"production",entityId:order.id,reference:order.number,timestamp,localUser:actor,afterSummary:`quantity=${actualQuantity};cost=${totalCost}`});
    return order;
  });
}

export async function completeSale(order: Omit<SaleOrder, "id" | "number" | "status" | "createdAt" | "updatedAt" | "createdBy">) {
  return db.transaction("rw", [db.settings, db.shifts, db.saleOrders, db.items, db.warehouses, db.balances, db.movements, db.accounts, db.journalEntries, db.journalLines, db.auditLogs], async () => {
    const settings = await db.settings.get("settings");
    const shift = await db.shifts.where("status").equals("open").first();
    if (!settings?.activeShift || !shift) throw new Error("يجب فتح وردية قبل تسجيل المبيعات");
    const finishedWarehouse = await activeWarehouse("finished");
    const reference = `INV-${Date.now().toString().slice(-8)}`;
    const timestamp = now();
    const movements: StockMovement[] = [];
    for (const line of order.items) {
      if (line.quantity <= 0) throw new Error("كمية البيع غير صحيحة");
      const item = await db.items.get(line.itemId);
      if (!item || item.stage !== "finished") throw new Error(`الصنف ${line.name} ليس منتجًا تامًا`);
      const balance = await getBalance(finishedWarehouse.id, item.id);
      const available = roundQuantity(balance.quantity - balance.reserved);
      if (available < line.quantity) throw new Error(`${item.nameAr}: المطلوب ${line.quantity} والمتاح ${available}`);
      await db.balances.put({ ...balance, quantity: roundQuantity(balance.quantity - line.quantity), updatedAt: timestamp });
      const cost = balance.averageCostPiasters || item.averageCostPiasters;
      movements.push({
        id: uid(), warehouseId: finishedWarehouse.id, sourceWarehouseId: finishedWarehouse.id, itemId: item.id,
        type: "finished_product_sale", quantity: -line.quantity, enteredQuantity: line.quantity, enteredUnitId: item.baseUnitId,
        unitCostPiasters: cost, totalCostPiasters: -multiplyMoney(cost, line.quantity), reference,
        createdAt: timestamp, updatedAt: timestamp, createdBy: "local-cashier",
      });
    }
    await db.movements.bulkPut(movements);
    const sale: SaleOrder = { ...order, id: uid(), number: reference, shiftId: shift.id, status: "paid", createdAt: timestamp, updatedAt: timestamp, createdBy: "local-cashier" };
    await db.saleOrders.put(sale);
    const cogsPiasters = movements.reduce((sum, movement) => sum + Math.abs(movement.totalCostPiasters), 0);
    await postSaleOrder(sale.id, sale.number, sale.subtotalPiasters, sale.taxPiasters, sale.totalPiasters, cogsPiasters, sale.paymentMethod);
    await db.auditLogs.add({id:uid(),action:"sale_complete",entityType:"sale",entityId:sale.id,reference:sale.number,timestamp,localUser:"local-cashier",afterSummary:`total=${sale.totalPiasters};shift=${shift.number}`});
    return sale;
  });
}

export async function saveProductionDefinition(input: {
  product: Pick<InventoryItem, "nameAr" | "nameEn" | "code" | "category" | "baseUnitId" | "salePricePiasters" | "imageDataUrl">;
  outputQuantity: number;
  outputUnitId: string;
  ingredients: Recipe["ingredients"];
  wastePercent?: number;
}) {
  return db.transaction("rw", [db.units, db.items, db.recipes], async () => {
    if (!input.ingredients.length) throw new Error("أضف مكونًا واحدًا على الأقل");
    const normalizedIngredients = await normalizeRecipeIngredientsToGrams(input.ingredients);
    const timestamp = now();
    let product = await db.items.where("code").equals(input.product.code.toUpperCase()).first();
    if (!product) {
      product = {
        id: uid(), code: input.product.code.toUpperCase(), nameAr: input.product.nameAr, nameEn: input.product.nameEn,
        category: input.product.category, stage: "finished", baseUnitId: input.product.baseUnitId,
        purchaseUnitId: input.product.baseUnitId, purchaseFactor: 1, minLevel: 0, averageCostPiasters: 0,
        salePricePiasters: input.product.salePricePiasters, imageDataUrl: input.product.imageDataUrl,
        active: true, createdAt: timestamp, updatedAt: timestamp, createdBy: actor,
      };
      await db.items.add(product);
    } else {
      await db.items.update(product.id, { salePricePiasters: input.product.salePricePiasters, imageDataUrl: input.product.imageDataUrl || product.imageDataUrl, updatedAt: timestamp });
    }
    const recipe: Recipe = {
      id: uid(), code: `REC-${input.product.code.toUpperCase()}`, nameAr: `تصنيع ${input.product.nameAr}`,
      outputItemId: product.id, outputQuantity: input.outputQuantity, outputUnitId: input.outputUnitId,
      sellingPricePiasters: input.product.salePricePiasters, version: 1, ingredients: normalizedIngredients,
      active: true, createdAt: timestamp, updatedAt: timestamp, createdBy: actor,
    };
    await db.recipes.add(recipe);
    return recipe;
  });
}
