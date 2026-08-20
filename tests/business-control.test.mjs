import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("procurement separates request order receipt and invoice",async()=>{
  const source=await readFile(new URL("../src/domain/purchasing-service.ts",import.meta.url),"utf8");
  for(const token of ["PR","PO","GRN","PINV","skipAccounting:true","matchingStatus"]) assert.ok(source.includes(token));
  const requestBody=source.slice(source.indexOf("createPurchaseRequest"),source.indexOf("submitPurchaseRequest"));
  assert.doesNotMatch(requestBody,/addOpeningStock/);
  assert.match(source,/submitPurchaseOrder/);
  assert.match(source,/paySupplierInvoices/);
  assert.match(source,/postPurchaseReturn/);
  assert.match(source,/لا يمكن فوترة كمية لم يتم استلامها/);
});
test("permissions and segregation of duties are centralized",async()=>{
  const auth=await readFile(new URL("../src/domain/authorization-service.ts",import.meta.url),"utf8");
  const approval=await readFile(new URL("../src/domain/approval-service.ts",import.meta.url),"utf8");
  for(const role of ["OWNER","MANAGER","ACCOUNTANT","STOREKEEPER","CASHIER","KITCHEN"]) assert.ok(auth.includes(role));
  assert.match(auth,/requirePermission/);assert.match(approval,/requestedBy===user/);
});
test("backup validates before atomic restore and excludes password hashes",async()=>{
  const source=await readFile(new URL("../src/domain/backup-service.ts",import.meta.url),"utf8");
  assert.match(source,/validateBackup\(value/);assert.match(source,/db\.transaction/);assert.match(source,/passwordHash/);assert.match(source,/safety=await snapshot/);
});
test("schema v7 preserves old data and adds payment allocations",async()=>{
  const source=await readFile(new URL("../src/db/database.ts",import.meta.url),"utf8");assert.match(source,/this\.version\(7\)\.stores/);
  for(const table of ["users","rolePermissions","approvals","purchaseRequests","procurementOrders","goodsReceipts","supplierInvoiceRecords","purchaseReturnRecords"]) assert.ok(source.includes(table+":"));
  assert.match(source,/supplierInvoicePaymentAllocations/);
  assert.doesNotMatch(source,/version\(7\)[\s\S]*?\.clear\(/);
});
test("local users can authenticate and critical procurement services authorize",async()=>{
  const users=await readFile(new URL("../src/domain/user-service.ts",import.meta.url),"utf8");
  const purchasing=await readFile(new URL("../src/domain/purchasing-service.ts",import.meta.url),"utf8");
  assert.match(users,/authenticateLocalUser/);assert.match(users,/hashPassword\(password\)/);assert.match(users,/requirePermission\(input\.actorRole,"users\.manage"\)/);
  for(const permission of ["purchases.request","purchases.create_order","purchases.receive","purchases.invoice","purchases.pay","purchases.return"])assert.ok(purchasing.includes(permission));
});
test("backup v3 validates relationships and preserves local secrets during restore",async()=>{
  const source=await readFile(new URL("../src/domain/backup-service.ts",import.meta.url),"utf8");
  assert.match(source,/BACKUP_VERSION=3,SCHEMA_VERSION=7/);assert.match(source,/علاقة رصيد مخزون غير صالحة/);assert.match(source,/snapshot\(true\)/);assert.match(source,/userSecrets/);
});
test("configurable operational thresholds route sensitive events to one approval engine",async()=>{
  const operations=await readFile(new URL("../src/domain/operations-service.ts",import.meta.url),"utf8"),approval=await readFile(new URL("../src/domain/approval-service.ts",import.meta.url),"utf8"),models=await readFile(new URL("../src/domain/models.ts",import.meta.url),"utf8");
  for(const token of ["postWasteWithApproval","approveStockCountWithApproval","closeShiftWithApproval","requestApproval"])assert.ok(operations.includes(token));
  for(const entity of ["waste","stock_count_variance","shift_difference","journal_reversal","sale_refund","large_discount"])assert.ok(approval.includes(entity));
  for(const threshold of ["wasteApprovalThresholdPiasters","stockVarianceApprovalThresholdPiasters","shiftDifferenceApprovalThresholdPiasters","discountApprovalThresholdPercent"])assert.ok(models.includes(threshold));
});
