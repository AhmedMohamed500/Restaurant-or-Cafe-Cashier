"use client";
import {db} from "@/src/db/database";
import type {InventoryRepository,PurchasingRepository,ReportingRepository,SalesRepository,UserRepository} from "./contracts";

export const dexieInventoryRepository:InventoryRepository={getItem:id=>db.items.get(id),getBalance:(warehouseId,itemId)=>db.balances.get(`${warehouseId}:${itemId}`)};
export const dexieSalesRepository:SalesRepository={list:async(from,to)=>(await db.saleOrders.toArray()).filter(x=>(!from||x.createdAt>=from)&&(!to||x.createdAt<=to))};
export const dexiePurchasingRepository:PurchasingRepository={getOrder:id=>db.procurementOrders.get(id),listOpenInvoices:async supplierId=>(await db.supplierInvoiceRecords.where("status").notEqual("paid").toArray()).filter(x=>!supplierId||x.supplierId===supplierId)};
export const dexieUserRepository:UserRepository={findByUsername:username=>db.users.where("username").equals(username).first()};
export const dexieReportingRepository:ReportingRepository={listSales:()=>db.saleOrders.toArray()};
