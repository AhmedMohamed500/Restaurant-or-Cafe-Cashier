export type EntityId = string;
export type ItemStage = "raw" | "work_in_progress" | "finished";
export type MovementType =
  | "opening"
  | "purchase"
  | "stock_receipt"
  | "transfer_to_kitchen_out"
  | "transfer_to_kitchen_in"
  | "production_consume"
  | "production_output"
  | "sale"
  | "finished_product_sale"
  | "adjustment"
  | "waste";

export interface AuditFields {
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface UnitOfMeasure extends AuditFields {
  id: EntityId;
  code: string;
  nameAr: string;
  nameEn: string;
  symbol: string;
  family: "mass" | "volume" | "count";
  baseFactor: number;
  active: boolean;
}

export interface InventoryItem extends AuditFields {
  id: EntityId;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  stage: ItemStage;
  baseUnitId: EntityId;
  purchaseUnitId: EntityId;
  purchaseFactor: number;
  minLevel: number;
  averageCostPiasters: number;
  salePricePiasters?: number;
  imageDataUrl?: string;
  active: boolean;
}

export interface Warehouse extends AuditFields {
  id: EntityId;
  code: string;
  nameAr: string;
  nameEn: string;
  stage: ItemStage;
  branchName: string;
  active: boolean;
}

export interface StockBalance {
  id: EntityId;
  warehouseId: EntityId;
  itemId: EntityId;
  quantity: number;
  reserved: number;
  averageCostPiasters: number;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: EntityId;
  itemId: EntityId;
  quantity: number;
  unitId: EntityId;
  wastePercent: number;
  optional: boolean;
}

export interface Recipe extends AuditFields {
  id: EntityId;
  code: string;
  nameAr: string;
  outputItemId: EntityId;
  outputQuantity: number;
  outputUnitId: EntityId;
  sellingPricePiasters?: number;
  version: number;
  ingredients: RecipeIngredient[];
  active: boolean;
}

export interface StockMovement extends AuditFields {
  id: EntityId;
  warehouseId: EntityId;
  itemId: EntityId;
  type: MovementType;
  quantity: number;
  unitCostPiasters: number;
  totalCostPiasters: number;
  reference: string;
  note?: string;
  /** Values below preserve how the user entered the movement while quantity stays in the item's base unit. */
  enteredQuantity?: number;
  enteredUnitId?: EntityId;
  sourceWarehouseId?: EntityId;
  destinationWarehouseId?: EntityId;
}

export interface ProductionOrder extends AuditFields {
  id: EntityId;
  number: string;
  recipeId: EntityId;
  plannedQuantity: number;
  actualQuantity: number;
  sourceWarehouseId: EntityId;
  targetWarehouseId: EntityId;
  status: "completed";
  totalCostPiasters: number;
  unitCostPiasters: number;
  wasteQuantity: number;
}

export interface OrderItem {
  id: EntityId;
  itemId: EntityId;
  name: string;
  quantity: number;
  unitPricePiasters: number;
  costPiasters: number;
}

export interface SaleOrder extends AuditFields {
  id: EntityId;
  number: string;
  type: "dine_in" | "takeaway" | "delivery";
  table?: string;
  items: OrderItem[];
  subtotalPiasters: number;
  taxPiasters: number;
  totalPiasters: number;
  paymentMethod: "cash" | "card" | "wallet";
  status: "paid";
  shiftId?: EntityId;
}

export type ExpenseCategory = "supplies" | "utilities" | "rent" | "maintenance" | "marketing" | "delivery" | "other";

export interface RestaurantExpense extends AuditFields {
  id: EntityId;
  category: ExpenseCategory;
  description: string;
  amountPiasters: number;
  paymentMethod: "cash" | "card" | "wallet";
  expenseDate: string;
  accountId?: EntityId;
  vatPiasters?: number;
  paidFromAccountId?: EntityId;
  reference?: string;
  notes?: string;
  attachmentName?: string;
}

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "contra_revenue" | "cost_of_sales" | "expense" | "other_income";

export interface AccountingAccount extends AuditFields {
  id: EntityId;
  code: string;
  nameAr: string;
  nameEn: string;
  parentId?: EntityId;
  type: AccountType;
  active: boolean;
  system: boolean;
}

export interface JournalEntry extends AuditFields {
  id: EntityId;
  entryNumber: string;
  date: string;
  referenceType: string;
  referenceId: EntityId;
  referenceNumber: string;
  description: string;
  status: "posted" | "reversed";
  postedAt: string;
  reversedEntryId?: EntityId;
}

export interface JournalLine {
  id: EntityId;
  journalEntryId: EntityId;
  accountId: EntityId;
  debitMinor: number;
  creditMinor: number;
  description: string;
  sourceModule: string;
  costCenterId?: EntityId;
  branchId?: EntityId;
}

export interface Supplier extends AuditFields {
  id: EntityId;
  code: string;
  name: string;
  phone?: string;
  taxNumber?: string;
  address?: string;
  openingBalancePiasters: number;
  paymentTerms?: string;
  notes?: string;
  active: boolean;
}

export interface PurchaseInvoice extends AuditFields {
  id: EntityId;
  invoiceNumber: string;
  date: string;
  supplierId: EntityId;
  warehouseId: EntityId;
  kind: "invoice" | "return";
  paymentType: "cash" | "credit" | "partial";
  paymentAccountId?: EntityId;
  paidPiasters: number;
  subtotalPiasters: number;
  vatPiasters: number;
  totalPiasters: number;
  reference?: string;
  notes?: string;
  status: "posted";
}

export interface PurchaseInvoiceLine {
  id: EntityId;
  purchaseInvoiceId: EntityId;
  itemId: EntityId;
  quantity: number;
  unitId: EntityId;
  unitCostPiasters: number;
  vatRate: number;
  subtotalPiasters: number;
  vatPiasters: number;
  lineTotalPiasters: number;
}

export interface SupplierPayment extends AuditFields {
  id: EntityId;
  supplierId: EntityId;
  date: string;
  amountPiasters: number;
  paymentMethod: "cash" | "bank";
  paymentAccountId: EntityId;
  reference: string;
  notes?: string;
}

export interface CashAccount extends AuditFields {
  id: EntityId;
  code: string;
  nameAr: string;
  type: "cash" | "bank" | "card_clearing" | "wallet_clearing";
  ledgerAccountId: EntityId;
  openingBalancePiasters: number;
  active: boolean;
}

export interface CashTransfer extends AuditFields {
  id: EntityId;
  number: string;
  date: string;
  fromCashAccountId: EntityId;
  toCashAccountId: EntityId;
  amountPiasters: number;
  reference?: string;
  notes?: string;
}

export interface CashierShift extends AuditFields {
  id: EntityId;
  number: string;
  cashier: string;
  openedAt: string;
  closedAt?: string;
  openingCashPiasters: number;
  cashSalesPiasters: number;
  cardSalesPiasters: number;
  walletSalesPiasters: number;
  cashRefundsPiasters: number;
  cashPaidOutsPiasters: number;
  cashInPiasters?: number;
  cashOutPiasters?: number;
  orderCount?: number;
  vatPiasters?: number;
  notes?: string;
  expectedCashPiasters: number;
  actualCashPiasters?: number;
  differencePiasters?: number;
  status: "open" | "closed";
  differenceStatus?: "balanced" | "shortage" | "surplus";
}

export interface ShiftCashMovement extends AuditFields {
  id: EntityId; shiftId: EntityId; number: string; type: "cash_in" | "cash_out";
  amountPiasters: number; reason: string; occurredAt: string;
}

export interface StockCount extends AuditFields {
  id: EntityId; number: string; warehouseId: EntityId; countDate: string;
  status: "draft" | "in_progress" | "reviewed" | "approved"; notes?: string; approvedAt?: string;
}

export interface StockCountLine {
  id: EntityId; stockCountId: EntityId; itemId: EntityId; unitId: EntityId;
  systemQuantity: number; actualQuantity?: number; differenceQuantity: number;
  unitCostPiasters: number; differenceValuePiasters: number;
}

export type WasteReason = "burned" | "spoiled" | "expired" | "dropped" | "overproduction" | "preparation" | "damaged" | "other";
export interface WasteEntry extends AuditFields {
  id: EntityId; number: string; occurredAt: string; warehouseId: EntityId; itemId: EntityId;
  quantity: number; enteredQuantity: number; unitId: EntityId; reason: WasteReason;
  unitCostPiasters: number; totalCostPiasters: number; shiftId?: EntityId; notes?: string;
}

export interface AuditLog {
  id: EntityId; action: string; entityType: string; entityId: EntityId; reference: string;
  timestamp: string; localUser: string; beforeSummary?: string; afterSummary?: string;
}

export interface OperationalAlert {
  id: EntityId; type: "low_stock" | "stock_variance" | "waste" | "shift_shortage" | "out_of_stock" | "negative_margin" | "ingredient_shortage";
  severity: "info" | "warning" | "critical"; title: string; message: string; entityId?: EntityId;
  createdAt: string; resolvedAt?: string;
}

export type Permission = "inventory.view"|"inventory.receive"|"inventory.transfer"|"production.view"|"production.execute"|"purchases.request"|"purchases.approve_request"|"purchases.create_order"|"purchases.approve_order"|"purchases.receive"|"waste.create"|"waste.approve"|"stock_count.create"|"stock_count.approve"|"cashier.sell"|"cashier.discount"|"cashier.refund"|"shifts.open"|"shifts.close"|"shifts.approve_difference"|"accounting.view"|"accounting.post"|"accounting.reverse"|"reports.financial"|"users.manage"|"settings.manage";
export type UserRole = "OWNER"|"MANAGER"|"ACCOUNTANT"|"STOREKEEPER"|"CASHIER"|"KITCHEN";
export interface LocalUser extends AuditFields { id:EntityId; username:string; displayName:string; passwordHash:string; role:UserRole; active:boolean; }
export interface RolePermission { id:EntityId; role:UserRole; permission:Permission; }
export interface Approval extends AuditFields { id:EntityId; entityType:string; entityId:EntityId; reference:string; requestedBy:string; requestedAt:string; status:"pending"|"approved"|"rejected"; approvedBy?:string; approvedAt?:string; rejectedBy?:string; rejectedAt?:string; rejectionReason?:string; notes?:string; }
export interface PurchaseRequest extends AuditFields { id:EntityId; number:string; requestDate:string; requestedBy:string; requiredDate:string; warehouseId:EntityId; notes?:string; status:"draft"|"pending_approval"|"approved"|"rejected"|"converted"; }
export interface PurchaseRequestLine { id:EntityId; purchaseRequestId:EntityId; itemId:EntityId; currentStock:number; minimumStock:number; requestedQuantity:number; unitId:EntityId; estimatedCostPiasters:number; notes?:string; }
export interface ProcurementOrder extends AuditFields { id:EntityId; number:string; requestId?:EntityId; supplierId:EntityId; orderDate:string; expectedDeliveryDate:string; warehouseId:EntityId; paymentTerms?:string; notes?:string; status:"draft"|"pending_approval"|"approved"|"partially_received"|"fully_received"|"cancelled"|"closed"; subtotalPiasters:number; discountPiasters:number; vatPiasters:number; totalPiasters:number; }
export interface ProcurementOrderLine { id:EntityId; purchaseOrderId:EntityId; itemId:EntityId; orderedQuantity:number; receivedQuantity:number; unitId:EntityId; unitPricePiasters:number; discountPiasters:number; vatRate:number; lineTotalPiasters:number; }
export interface GoodsReceipt { id:EntityId; number:string; purchaseOrderId:EntityId; supplierId:EntityId; warehouseId:EntityId; receiptDate:string; receivedBy:string; notes?:string; status:"posted"; createdAt:string; updatedAt:string; createdBy:string; }
export interface GoodsReceiptLine { id:EntityId; goodsReceiptId:EntityId; purchaseOrderLineId:EntityId; itemId:EntityId; quantity:number; unitId:EntityId; unitCostPiasters:number; }
export interface SupplierInvoiceRecord extends AuditFields { id:EntityId; number:string; supplierInvoiceNumber:string; supplierId:EntityId; invoiceDate:string; dueDate:string; purchaseOrderId?:EntityId; goodsReceiptId?:EntityId; subtotalPiasters:number; discountPiasters:number; vatPiasters:number; totalPiasters:number; paidPiasters:number; matchingStatus:"matched"|"quantity_difference"|"price_difference"|"unmatched"; status:"unpaid"|"partially_paid"|"paid"; notes?:string; }
export interface SupplierInvoiceRecordLine { id:EntityId; supplierInvoiceId:EntityId; itemId:EntityId; quantity:number; unitId:EntityId; unitCostPiasters:number; discountPiasters:number; vatRate:number; totalPiasters:number; }
export interface PurchaseReturnRecord extends AuditFields { id:EntityId; number:string; supplierId:EntityId; goodsReceiptId?:EntityId; supplierInvoiceId?:EntityId; warehouseId:EntityId; itemId:EntityId; quantity:number; unitId:EntityId; reason:"damaged"|"wrong_item"|"quality"|"expired"|"supplier_error"|"other"; totalPiasters:number; status:"posted"; }

export interface Employee extends AuditFields {
  id: EntityId;
  code: string;
  name: string;
  role: string;
  phone?: string;
  baseSalaryPiasters: number;
  hireDate: string;
  status: "active" | "inactive";
}

export interface AttendanceRecord extends AuditFields {
  id: EntityId;
  employeeId: EntityId;
  workDate: string;
  status: "present" | "absent" | "leave";
  checkIn?: string;
  checkOut?: string;
  overtimeHours: number;
}

export interface PayrollRecord extends AuditFields {
  id: EntityId;
  employeeId: EntityId;
  month: string;
  baseSalaryPiasters: number;
  overtimePiasters: number;
  bonusPiasters: number;
  deductionPiasters: number;
  advancePiasters: number;
  netPiasters: number;
  status: "pending" | "paid";
  paidAt?: string;
}

export interface AppSettings {
  id: "settings";
  language: "ar" | "en";
  theme: "light" | "dark";
  seeded: boolean;
  activeShift: boolean;
  restaurantName?: string;
  logoDataUrl?: string;
  username?: string;
  passwordHash?: string;
}
