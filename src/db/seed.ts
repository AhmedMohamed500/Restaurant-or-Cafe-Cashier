"use client";

import { db } from "./database";
import type {
  InventoryItem,
  Recipe,
  StockBalance,
  UnitOfMeasure,
  Warehouse,
} from "@/src/domain/models";

const now = new Date().toISOString();
const audit = { createdAt: now, updatedAt: now, createdBy: "demo-owner" };

export const demoUnits: UnitOfMeasure[] = [
  { id: "u-kg", code: "KG", nameAr: "كيلوجرام", nameEn: "Kilogram", symbol: "كجم", family: "mass", baseFactor: 1000, active: true, ...audit },
  { id: "u-g", code: "G", nameAr: "جرام", nameEn: "Gram", symbol: "جم", family: "mass", baseFactor: 1, active: true, ...audit },
  { id: "u-l", code: "L", nameAr: "لتر", nameEn: "Liter", symbol: "لتر", family: "volume", baseFactor: 1000, active: true, ...audit },
  { id: "u-ml", code: "ML", nameAr: "ملليلتر", nameEn: "Milliliter", symbol: "مل", family: "volume", baseFactor: 1, active: true, ...audit },
  { id: "u-pc", code: "PC", nameAr: "قطعة", nameEn: "Piece", symbol: "قطعة", family: "count", baseFactor: 1, active: true, ...audit },
];

export const demoWarehouses: Warehouse[] = [
  { id: "wh-raw", code: "WH-RAW", nameAr: "مخزن المواد الخام", nameEn: "Raw materials", stage: "raw", branchName: "فرع الزمالك", active: true, ...audit },
  { id: "wh-wip", code: "WH-WIP", nameAr: "مخزن تحت التشغيل", nameEn: "Work in progress", stage: "work_in_progress", branchName: "فرع الزمالك", active: true, ...audit },
  { id: "wh-fg", code: "WH-FG", nameAr: "مخزن المنتج التام", nameEn: "Finished goods", stage: "finished", branchName: "فرع الزمالك", active: true, ...audit },
];

export const demoItems: InventoryItem[] = [
  { id: "i-flour", code: "RM-001", nameAr: "دقيق فاخر", nameEn: "Premium flour", category: "مخبوزات", stage: "raw", baseUnitId: "u-g", purchaseUnitId: "u-kg", purchaseFactor: 1000, minLevel: 8000, averageCostPiasters: 4, active: true, ...audit },
  { id: "i-cheese", code: "RM-002", nameAr: "جبنة موتزاريلا", nameEn: "Mozzarella", category: "ألبان", stage: "raw", baseUnitId: "u-g", purchaseUnitId: "u-kg", purchaseFactor: 1000, minLevel: 5000, averageCostPiasters: 22, active: true, ...audit },
  { id: "i-tomato", code: "RM-003", nameAr: "طماطم", nameEn: "Tomato", category: "خضروات", stage: "raw", baseUnitId: "u-g", purchaseUnitId: "u-kg", purchaseFactor: 1000, minLevel: 4000, averageCostPiasters: 3, active: true, ...audit },
  { id: "i-oil", code: "RM-004", nameAr: "زيت زيتون", nameEn: "Olive oil", category: "زيوت", stage: "raw", baseUnitId: "u-ml", purchaseUnitId: "u-l", purchaseFactor: 1000, minLevel: 2000, averageCostPiasters: 18, active: true, ...audit },
  { id: "i-dough", code: "WIP-001", nameAr: "عجينة بيتزا", nameEn: "Pizza dough", category: "تجهيزات", stage: "work_in_progress", baseUnitId: "u-g", purchaseUnitId: "u-kg", purchaseFactor: 1000, minLevel: 2000, averageCostPiasters: 0, active: true, ...audit },
  { id: "i-sauce", code: "WIP-002", nameAr: "صلصة بيتزا", nameEn: "Pizza sauce", category: "تجهيزات", stage: "work_in_progress", baseUnitId: "u-g", purchaseUnitId: "u-kg", purchaseFactor: 1000, minLevel: 1000, averageCostPiasters: 0, active: true, ...audit },
  { id: "i-pizza", code: "FG-001", nameAr: "بيتزا مارجريتا", nameEn: "Margherita pizza", category: "بيتزا", stage: "finished", baseUnitId: "u-pc", purchaseUnitId: "u-pc", purchaseFactor: 1, minLevel: 0, averageCostPiasters: 0, salePricePiasters: 14500, active: true, ...audit },
  { id: "i-pasta", code: "FG-002", nameAr: "باستا ألفريدو", nameEn: "Alfredo pasta", category: "باستا", stage: "finished", baseUnitId: "u-pc", purchaseUnitId: "u-pc", purchaseFactor: 1, minLevel: 0, averageCostPiasters: 5200, salePricePiasters: 12900, active: true, ...audit },
  { id: "i-coffee", code: "FG-003", nameAr: "كابتشينو", nameEn: "Cappuccino", category: "مشروبات", stage: "finished", baseUnitId: "u-pc", purchaseUnitId: "u-pc", purchaseFactor: 1, minLevel: 0, averageCostPiasters: 2100, salePricePiasters: 6800, active: true, ...audit },
];

export const demoRecipes: Recipe[] = [
  {
    id: "r-dough", code: "REC-001", nameAr: "عجينة البيتزا الأساسية", outputItemId: "i-dough",
    outputQuantity: 10000, outputUnitId: "u-g", version: 1, active: true,
    ingredients: [
      { id: "ri-1", itemId: "i-flour", quantity: 6000, unitId: "u-g", wastePercent: 1, optional: false },
      { id: "ri-2", itemId: "i-oil", quantity: 150, unitId: "u-ml", wastePercent: 0, optional: false },
    ], ...audit,
  },
  {
    id: "r-sauce", code: "REC-002", nameAr: "صلصة البيتزا", outputItemId: "i-sauce",
    outputQuantity: 5000, outputUnitId: "u-g", version: 1, active: true,
    ingredients: [
      { id: "ri-3", itemId: "i-tomato", quantity: 4800, unitId: "u-g", wastePercent: 4, optional: false },
      { id: "ri-4", itemId: "i-oil", quantity: 100, unitId: "u-ml", wastePercent: 0, optional: false },
    ], ...audit,
  },
  {
    id: "r-pizza", code: "REC-003", nameAr: "بيتزا مارجريتا وسط", outputItemId: "i-pizza",
    outputQuantity: 1, outputUnitId: "u-pc", sellingPricePiasters: 14500, version: 1, active: true,
    ingredients: [
      { id: "ri-5", itemId: "i-dough", quantity: 250, unitId: "u-g", wastePercent: 0, optional: false },
      { id: "ri-6", itemId: "i-sauce", quantity: 90, unitId: "u-g", wastePercent: 0, optional: false },
      { id: "ri-7", itemId: "i-cheese", quantity: 120, unitId: "u-g", wastePercent: 2, optional: false },
    ], ...audit,
  },
];

const openingBalances: StockBalance[] = [
  ["i-flour", 35000, 4], ["i-cheese", 18000, 22], ["i-tomato", 22000, 3], ["i-oil", 9000, 18],
].map(([itemId, quantity, cost]) => ({
  id: `wh-raw:${itemId}`,
  warehouseId: "wh-raw",
  itemId: String(itemId),
  quantity: Number(quantity),
  reserved: 0,
  averageCostPiasters: Number(cost),
  updatedAt: now,
}));

export async function ensureSeedData() {
  const settings = await db.settings.get("settings");
  if (settings?.seeded) return;
  await db.transaction("rw", [db.units, db.items, db.warehouses, db.balances, db.recipes, db.movements, db.settings], async () => {
    await Promise.all([db.units.bulkPut(demoUnits), db.items.bulkPut(demoItems), db.warehouses.bulkPut(demoWarehouses), db.balances.bulkPut(openingBalances), db.recipes.bulkPut(demoRecipes)]);
    await db.movements.bulkPut(openingBalances.map((balance, index) => ({
      id: `mv-open-${index}`,
      warehouseId: balance.warehouseId,
      itemId: balance.itemId,
      type: "opening" as const,
      quantity: balance.quantity,
      unitCostPiasters: balance.averageCostPiasters,
      totalCostPiasters: Math.round(balance.quantity * balance.averageCostPiasters),
      reference: "رصيد افتتاحي",
      ...audit,
    })));
    await db.settings.put({ id: "settings", language: "ar", theme: "light", seeded: true, activeShift: true });
  });
}

export async function resetDemoData() {
  await db.delete();
  await db.open();
  await ensureSeedData();
}
