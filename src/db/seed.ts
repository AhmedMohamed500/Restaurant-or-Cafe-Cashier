"use client";

import { db } from "./database";
import { normalizeRecipeMassQuantity } from "@/src/lib/units";

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
    [db.units, db.warehouses, db.recipes, db.shifts, db.settings],
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
      const gramUnit = await db.units.where("code").equals("G").first();
      const units = await db.units.toArray();
      const unitsById = new Map(units.map((unit) => [unit.id, unit]));
      if (gramUnit) {
        await db.recipes.toCollection().modify((recipe) => {
          let changed = false;
          recipe.ingredients = recipe.ingredients.map((ingredient) => {
            const unit = unitsById.get(ingredient.unitId);
            if (!unit || unit.family !== "mass" || unit.id === gramUnit.id) return ingredient;
            changed = true;
            return { ...ingredient, quantity: normalizeRecipeMassQuantity(ingredient.quantity, unit.family, unit.baseFactor), unitId: gramUnit.id };
          });
          if (changed) recipe.updatedAt = timestamp;
        });
      }
      const settings = await db.settings.get("settings");
      const openShift = await db.shifts.where("status").equals("open").first();
      await db.settings.put({ ...settings, id: "settings", language: settings?.language ?? "ar", theme: settings?.theme ?? "light", seeded: false, activeShift: Boolean(openShift) });
    },
  );
}

export async function resetAllData() {
  await db.transaction(
    "rw",
    [db.units, db.items, db.warehouses, db.balances, db.recipes, db.movements, db.productionOrders, db.saleOrders, db.expenses, db.employees, db.attendanceRecords, db.payrollRecords, db.accounts, db.journalEntries, db.journalLines, db.suppliers, db.purchaseInvoices, db.purchaseInvoiceLines, db.supplierPayments, db.cashAccounts, db.cashTransfers, db.shifts, db.shiftCashMovements, db.stockCounts, db.stockCountLines, db.wasteEntries, db.auditLogs, db.alerts, db.users, db.rolePermissions, db.approvals, db.purchaseRequests, db.purchaseRequestLines, db.procurementOrders, db.procurementOrderLines, db.goodsReceipts, db.goodsReceiptLines, db.supplierInvoiceRecords, db.supplierInvoiceRecordLines, db.supplierInvoicePaymentAllocations, db.purchaseReturnRecords],
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
        db.expenses.clear(),
        db.employees.clear(),
        db.attendanceRecords.clear(),
        db.payrollRecords.clear(),
        db.accounts.clear(),
        db.journalEntries.clear(),
        db.journalLines.clear(),
        db.suppliers.clear(),
        db.purchaseInvoices.clear(),
        db.purchaseInvoiceLines.clear(),
        db.supplierPayments.clear(),
        db.cashAccounts.clear(),
        db.cashTransfers.clear(),
        db.shifts.clear(),
        db.shiftCashMovements.clear(),
        db.stockCounts.clear(),
        db.stockCountLines.clear(),
        db.wasteEntries.clear(),
        db.auditLogs.clear(),
        db.alerts.clear(),
        db.users.clear(), db.rolePermissions.clear(), db.approvals.clear(), db.purchaseRequests.clear(), db.purchaseRequestLines.clear(),
        db.procurementOrders.clear(), db.procurementOrderLines.clear(), db.goodsReceipts.clear(), db.goodsReceiptLines.clear(),
        db.supplierInvoiceRecords.clear(), db.supplierInvoiceRecordLines.clear(), db.supplierInvoicePaymentAllocations.clear(), db.purchaseReturnRecords.clear(),
      ]);
    },
  );
}
