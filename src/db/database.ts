"use client";

import Dexie, { type EntityTable } from "dexie";
import type {
  AppSettings,
  AccountingAccount,
  AttendanceRecord,
  CashAccount,
  CashierShift,
  CashTransfer,
  Employee,
  InventoryItem,
  JournalEntry,
  JournalLine,
  ProductionOrder,
  PayrollRecord,
  PurchaseInvoice,
  PurchaseInvoiceLine,
  Recipe,
  RestaurantExpense,
  Supplier,
  SupplierPayment,
  ShiftCashMovement,
  StockCount,
  StockCountLine,
  WasteEntry,
  AuditLog,
  OperationalAlert,
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
  expenses!: EntityTable<RestaurantExpense, "id">;
  employees!: EntityTable<Employee, "id">;
  attendanceRecords!: EntityTable<AttendanceRecord, "id">;
  payrollRecords!: EntityTable<PayrollRecord, "id">;
  accounts!: EntityTable<AccountingAccount, "id">;
  journalEntries!: EntityTable<JournalEntry, "id">;
  journalLines!: EntityTable<JournalLine, "id">;
  suppliers!: EntityTable<Supplier, "id">;
  purchaseInvoices!: EntityTable<PurchaseInvoice, "id">;
  purchaseInvoiceLines!: EntityTable<PurchaseInvoiceLine, "id">;
  supplierPayments!: EntityTable<SupplierPayment, "id">;
  cashAccounts!: EntityTable<CashAccount, "id">;
  cashTransfers!: EntityTable<CashTransfer, "id">;
  shifts!: EntityTable<CashierShift, "id">;
  shiftCashMovements!: EntityTable<ShiftCashMovement, "id">;
  stockCounts!: EntityTable<StockCount, "id">;
  stockCountLines!: EntityTable<StockCountLine, "id">;
  wasteEntries!: EntityTable<WasteEntry, "id">;
  auditLogs!: EntityTable<AuditLog, "id">;
  alerts!: EntityTable<OperationalAlert, "id">;
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
    this.version(2).stores({
      units: "id, code, family, active",
      items: "id, code, nameAr, category, stage, active",
      warehouses: "id, code, stage, active",
      balances: "id, [warehouseId+itemId], warehouseId, itemId",
      recipes: "id, code, outputItemId, active",
      movements: "id, warehouseId, itemId, type, reference, createdAt, sourceWarehouseId, destinationWarehouseId",
      productionOrders: "id, number, recipeId, createdAt",
      saleOrders: "id, number, createdAt",
      settings: "id",
    }).upgrade(async (transaction) => {
      const movements = transaction.table<StockMovement>("movements");
      await movements.toCollection().modify((movement) => {
        movement.enteredQuantity ??= Math.abs(movement.quantity);
        movement.sourceWarehouseId ??= movement.quantity < 0 ? movement.warehouseId : undefined;
        movement.destinationWarehouseId ??= movement.quantity > 0 ? movement.warehouseId : undefined;
      });
    });
    this.version(3).stores({
      units: "id, code, family, active",
      items: "id, code, nameAr, category, stage, active",
      warehouses: "id, code, stage, active",
      balances: "id, [warehouseId+itemId], warehouseId, itemId",
      recipes: "id, code, outputItemId, active",
      movements: "id, warehouseId, itemId, type, reference, createdAt, sourceWarehouseId, destinationWarehouseId",
      productionOrders: "id, number, recipeId, createdAt",
      saleOrders: "id, number, createdAt, paymentMethod",
      expenses: "id, category, expenseDate, paymentMethod, createdAt",
      employees: "id, code, name, role, status",
      attendanceRecords: "id, employeeId, workDate, status",
      payrollRecords: "id, employeeId, month, status",
      settings: "id",
    });
    this.version(4).stores({
      units: "id, code, family, active",
      items: "id, code, nameAr, category, stage, active",
      warehouses: "id, code, stage, active",
      balances: "id, [warehouseId+itemId], warehouseId, itemId",
      recipes: "id, code, outputItemId, active",
      movements: "id, warehouseId, itemId, type, reference, createdAt, sourceWarehouseId, destinationWarehouseId",
      productionOrders: "id, number, recipeId, createdAt",
      saleOrders: "id, number, createdAt, paymentMethod",
      expenses: "id, category, expenseDate, paymentMethod, accountId, paidFromAccountId, createdAt",
      employees: "id, code, name, role, status",
      attendanceRecords: "id, employeeId, workDate, status",
      payrollRecords: "id, employeeId, month, status",
      accounts: "id, &code, parentId, type, active, system",
      journalEntries: "id, &entryNumber, [referenceType+referenceId], referenceType, referenceId, referenceNumber, date, status",
      journalLines: "id, journalEntryId, accountId, sourceModule",
      suppliers: "id, &code, name, active",
      purchaseInvoices: "id, &invoiceNumber, supplierId, warehouseId, date, kind, paymentType, status",
      purchaseInvoiceLines: "id, purchaseInvoiceId, itemId",
      supplierPayments: "id, supplierId, date, paymentAccountId",
      cashAccounts: "id, &code, type, ledgerAccountId, active",
      cashTransfers: "id, &number, date, fromCashAccountId, toCashAccountId",
      shifts: "id, &number, cashier, openedAt, status",
      settings: "id",
    });
    this.version(5).stores({
      units: "id, code, family, active",
      items: "id, code, nameAr, category, stage, active",
      warehouses: "id, code, stage, active",
      balances: "id, [warehouseId+itemId], warehouseId, itemId",
      recipes: "id, code, outputItemId, active",
      movements: "id, warehouseId, itemId, type, reference, createdAt, sourceWarehouseId, destinationWarehouseId",
      productionOrders: "id, number, recipeId, createdAt",
      saleOrders: "id, number, createdAt, paymentMethod, shiftId",
      expenses: "id, category, expenseDate, paymentMethod, accountId, paidFromAccountId, createdAt",
      employees: "id, code, name, role, status",
      attendanceRecords: "id, employeeId, workDate, status",
      payrollRecords: "id, employeeId, month, status",
      accounts: "id, &code, parentId, type, active, system",
      journalEntries: "id, &entryNumber, [referenceType+referenceId], referenceType, referenceId, referenceNumber, date, status",
      journalLines: "id, journalEntryId, accountId, sourceModule",
      suppliers: "id, &code, name, active",
      purchaseInvoices: "id, &invoiceNumber, supplierId, warehouseId, date, kind, paymentType, status",
      purchaseInvoiceLines: "id, purchaseInvoiceId, itemId",
      supplierPayments: "id, supplierId, date, paymentAccountId",
      cashAccounts: "id, &code, type, ledgerAccountId, active",
      cashTransfers: "id, &number, date, fromCashAccountId, toCashAccountId",
      shifts: "id, &number, cashier, openedAt, status",
      shiftCashMovements: "id, &number, shiftId, type, occurredAt",
      stockCounts: "id, &number, warehouseId, countDate, status",
      stockCountLines: "id, stockCountId, itemId",
      wasteEntries: "id, &number, warehouseId, itemId, reason, occurredAt, shiftId",
      auditLogs: "id, action, entityType, entityId, reference, timestamp",
      alerts: "id, type, severity, entityId, createdAt, resolvedAt",
      settings: "id",
    });
  }
}

export const db = new RestaurantFlowDatabase();
