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
}

export type ExpenseCategory = "supplies" | "utilities" | "rent" | "maintenance" | "marketing" | "delivery" | "other";

export interface RestaurantExpense extends AuditFields {
  id: EntityId;
  category: ExpenseCategory;
  description: string;
  amountPiasters: number;
  paymentMethod: "cash" | "card" | "wallet";
  expenseDate: string;
}

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
