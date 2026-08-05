"use client";

import { db } from "./database";

const systemUnits = [
  { id: "unit-g", code: "G", nameAr: "جرام", nameEn: "Gram", symbol: "جم", family: "mass" as const, baseFactor: 1 },
  { id: "unit-kg", code: "KG", nameAr: "كيلوجرام", nameEn: "Kilogram", symbol: "كجم", family: "mass" as const, baseFactor: 1000 },
  { id: "unit-count", code: "COUNT", nameAr: "عدد", nameEn: "Count", symbol: "عدد", family: "count" as const, baseFactor: 1 },
];

const systemWarehouses = [
  { id: "wh-main", code: "MAIN", nameAr: "المخزن الرئيسي", nameEn: "Main Inventory", stage: "raw" as const },
  { id: "wh-kitchen", code: "KITCHEN", nameAr: "المطبخ", nameEn: "Kitchen", stage: "work_in_progress" as const },
  { id: "wh-finished", code: "FINISHED", nameAr: "المنتج التام", nameEn: "Finished Goods", stage: "finished" as const },
];

/** Initializes the three internal stages without deleting existing restaurant data. */
export async function ensureEmptyWorkspace() {
  await db.transaction(
    "rw",
    [db.units, db.warehouses, db.settings],
    async () => {
      const timestamp = new Date().toISOString();
      for (const unit of systemUnits) {
        if (!(await db.units.where("code").equals(unit.code).first())) {
          await db.units.put({ ...unit, active: true, createdAt: timestamp, updatedAt: timestamp, createdBy: "system" });
        }
      }
      for (const warehouse of systemWarehouses) {
        if (!(await db.warehouses.where("code").equals(warehouse.code).first())) {
          await db.warehouses.put({ ...warehouse, branchName: "الفرع الرئيسي", active: true, createdAt: timestamp, updatedAt: timestamp, createdBy: "system" });
        }
      }
      const settings = await db.settings.get("settings");
      await db.settings.put({ ...settings, id: "settings", language: settings?.language ?? "ar", theme: settings?.theme ?? "light", seeded: false, activeShift: settings?.activeShift ?? true });
    },
  );
}

export async function resetAllData() {
  await db.transaction(
    "rw",
    [db.units, db.items, db.warehouses, db.balances, db.recipes, db.movements, db.productionOrders, db.saleOrders],
    async () => {
      await Promise.all([
        db.units.clear(),
        db.items.clear(),
        db.warehouses.clear(),
        db.balances.clear(),
        db.recipes.clear(),
        db.movements.clear(),
        db.productionOrders.clear(),
        db.saleOrders.clear(),
      ]);
    },
  );
}
