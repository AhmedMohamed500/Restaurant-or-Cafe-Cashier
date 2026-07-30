"use client";

import Dexie, { type EntityTable } from "dexie";
import type {
  AppSettings,
  InventoryItem,
  ProductionOrder,
  Recipe,
  SaleOrder,
  StockBalance,
  StockMovement,
  UnitOfMeasure,
  Warehouse,
} from "@/src/domain/models";

export class RestaurantFlowDatabase extends Dexie {
  units!: EntityTable<UnitOfMeasure, "id">;
  items!: EntityTable<InventoryItem, "id">;
  warehouses!: EntityTable<Warehouse, "id">;
  balances!: EntityTable<StockBalance, "id">;
  recipes!: EntityTable<Recipe, "id">;
  movements!: EntityTable<StockMovement, "id">;
  productionOrders!: EntityTable<ProductionOrder, "id">;
  saleOrders!: EntityTable<SaleOrder, "id">;
  settings!: EntityTable<AppSettings, "id">;

  constructor() {
    super("RestaurantFlowPOS");
    this.version(1).stores({
      units: "id, code, family, active",
      items: "id, code, nameAr, category, stage, active",
      warehouses: "id, code, stage, active",
      balances: "id, [warehouseId+itemId], warehouseId, itemId",
      recipes: "id, code, outputItemId, active",
      movements: "id, warehouseId, itemId, type, reference, createdAt",
      productionOrders: "id, number, recipeId, createdAt",
      saleOrders: "id, number, createdAt",
      settings: "id",
    });
  }
}

export const db = new RestaurantFlowDatabase();
