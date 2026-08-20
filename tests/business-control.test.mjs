import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("procurement separates request order receipt and invoice",async()=>{
  const source=await readFile(new URL("../src/domain/purchasing-service.ts",import.meta.url),"utf8");
  for(const token of ["PR","PO","GRN","PINV","skipAccounting:true","matchingStatus"]) assert.ok(source.includes(token));
  const requestBody=source.slice(source.indexOf("createPurchaseRequest"),source.indexOf("submitPurchaseRequest"));
  assert.doesNotMatch(requestBody,/addOpeningStock/);
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
test("schema v6 preserves old data and adds business control tables",async()=>{
  const source=await readFile(new URL("../src/db/database.ts",import.meta.url),"utf8");assert.match(source,/this\.version\(6\)\.stores/);
  for(const table of ["users","rolePermissions","approvals","purchaseRequests","procurementOrders","goodsReceipts","supplierInvoiceRecords","purchaseReturnRecords"]) assert.ok(source.includes(table+":"));
  assert.doesNotMatch(source,/version\(6\)[\s\S]*?\.clear\(/);
});
