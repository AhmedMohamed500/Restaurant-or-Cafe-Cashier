import type {EntityId,InventoryItem,LocalUser,ProcurementOrder,SaleOrder,StockBalance,SupplierInvoiceRecord} from "@/src/domain/models";

/** Stable data-access contracts used by domain services today and remote implementations later. */
export interface InventoryRepository { getItem(id:EntityId):Promise<InventoryItem|undefined>; getBalance(warehouseId:EntityId,itemId:EntityId):Promise<StockBalance|undefined>; }
export interface SalesRepository { list(from?:string,to?:string):Promise<SaleOrder[]>; }
export interface PurchasingRepository { getOrder(id:EntityId):Promise<ProcurementOrder|undefined>; listOpenInvoices(supplierId?:EntityId):Promise<SupplierInvoiceRecord[]>; }
export interface UserRepository { findByUsername(username:string):Promise<LocalUser|undefined>; }
export interface ReportingRepository { listSales():Promise<SaleOrder[]>; }
