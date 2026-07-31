"use client";

import { db } from "./database";

/**
 * Initializes an empty workspace. Version 2 intentionally removes the old
 * showcase seed so every restaurant starts with its own real structure.
 */
export async function ensureEmptyWorkspace() {
  const settings = await db.settings.get("settings");
  if (settings && settings.seeded === false) return;

  await db.transaction(
    "rw",
    [db.units, db.items, db.warehouses, db.balances, db.recipes, db.movements, db.productionOrders, db.saleOrders, db.settings],
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
      await db.settings.put({ id: "settings", language: "ar", theme: "light", seeded: false, activeShift: true });
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
