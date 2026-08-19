import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildCashTransferLines,
  buildExpenseLines,
  buildProductionLines,
  buildPurchaseJournalLines,
  buildSaleLines,
  buildShiftDifferenceLines,
  buildStockTransferLines,
  buildSupplierPaymentLines,
  calculateBalanceSheet,
  calculateProfitLoss,
  summarizeTrialBalance,
  validateJournalLines,
} from "../src/domain/accounting-rules.ts";

const balanced = (lines) => validateJournalLines(lines).debitMinor;

test("rejects unbalanced, negative, or double-sided journal lines", () => {
  assert.throws(() => validateJournalLines([{ accountCode: "1", debitMinor: 100, creditMinor: 0, description: "x" }, { accountCode: "2", debitMinor: 0, creditMinor: 99, description: "y" }]), /غير متوازن/);
  assert.throws(() => validateJournalLines([{ accountCode: "1", debitMinor: -1, creditMinor: 0, description: "x" }, { accountCode: "2", debitMinor: 0, creditMinor: 1, description: "y" }]), /غير سالبة/);
});

test("posts cash and credit purchases with input VAT", () => {
  const cash = buildPurchaseJournalLines({ inventoryMinor: 10000, vatMinor: 1400, paidMinor: 11400, totalMinor: 11400, paymentAccountCode: "1110" });
  assert.equal(balanced(cash), 11400);
  assert.equal(cash.find((x) => x.accountCode === "2190").debitMinor, 1400);
  assert.equal(cash.find((x) => x.accountCode === "1110").creditMinor, 11400);
  const credit = buildPurchaseJournalLines({ inventoryMinor: 10000, vatMinor: 1400, paidMinor: 0, totalMinor: 11400 });
  assert.equal(balanced(credit), 11400);
  assert.equal(credit.find((x) => x.accountCode === "2110").creditMinor, 11400);
});

test("posts supplier payment and operating expense", () => {
  assert.equal(balanced(buildSupplierPaymentLines(5000, "1130")), 5000);
  const expense = buildExpenseLines({ expenseAccountCode: "6120", amountMinor: 10000, vatMinor: 1400, paymentAccountCode: "1110" });
  assert.equal(balanced(expense), 11400);
  assert.equal(expense.find((x) => x.accountCode === "2190").debitMinor, 1400);
});

test("posts sales, output VAT, and finished-goods COGS without raw-material deduction", () => {
  const lines = buildSaleLines({ subtotalMinor: 36000, vatMinor: 5040, totalMinor: 41040, cogsMinor: 19500, paymentAccountCode: "1120" });
  assert.equal(balanced(lines), 60540);
  assert.equal(lines.find((x) => x.accountCode === "2200").creditMinor, 5040);
  assert.equal(lines.find((x) => x.accountCode === "5100").debitMinor, 19500);
  assert.equal(lines.find((x) => x.accountCode === "1230").creditMinor, 19500);
  assert.equal(lines.some((x) => x.accountCode === "1210" || x.accountCode === "1220"), false);
});

test("posts inventory-to-kitchen and production asset transfers", () => {
  assert.equal(balanced(buildStockTransferLines(2250)), 2250);
  assert.equal(balanced(buildProductionLines(130000)), 130000);
  assert.deepEqual(buildStockTransferLines(2250).map((x) => x.accountCode), ["1220", "1210"]);
  assert.deepEqual(buildProductionLines(130000).map((x) => x.accountCode), ["1230", "1220"]);
});

test("cash transfers and shift differences stay balanced", () => {
  assert.equal(balanced(buildCashTransferLines(30000, "1110", "1130")), 30000);
  assert.equal(balanced(buildShiftDifferenceLines(-500)), 500);
  assert.equal(balanced(buildShiftDifferenceLines(750)), 750);
  assert.deepEqual(buildShiftDifferenceLines(0), []);
});

test("trial balance totals remain equal", () => {
  const sale = buildSaleLines({ subtotalMinor: 10000, vatMinor: 1400, totalMinor: 11400, cogsMinor: 4000, paymentAccountCode: "1120" });
  const lines = sale.map((x, index) => ({ accountId: `${x.accountCode}-${index}`, debitMinor: x.debitMinor, creditMinor: x.creditMinor }));
  const trial = summarizeTrialBalance(lines);
  assert.equal(trial.balanced, true);
  assert.equal(trial.debitMinor, trial.creditMinor);
});

test("calculates profit and loss from account balances", () => {
  const report = calculateProfitLoss([{ type: "revenue", balanceMinor: -100000 }, { type: "cost_of_sales", balanceMinor: 40000 }, { type: "expense", balanceMinor: 20000 }, { type: "other_income", balanceMinor: -5000 }]);
  assert.equal(report.grossProfitMinor, 60000);
  assert.equal(report.netProfitMinor, 45000);
});

test("validates balance sheet equality including current profit", () => {
  const report = calculateBalanceSheet([{ type: "asset", balanceMinor: 145000 }, { type: "liability", balanceMinor: -60000 }, { type: "equity", balanceMinor: -40000 }, { type: "revenue", balanceMinor: -100000 }, { type: "cost_of_sales", balanceMinor: 40000 }, { type: "expense", balanceMinor: 15000 }]);
  assert.equal(report.currentProfitMinor, 45000);
  assert.equal(report.liabilitiesAndEquityMinor, 145000);
  assert.equal(report.balanced, true);
});

test("schema v4 migration preserves every existing operational table", async () => {
  const source = await readFile(new URL("../src/db/database.ts", import.meta.url), "utf8");
  assert.match(source, /this\.version\(4\)\.stores/);
  for (const table of ["items", "warehouses", "balances", "movements", "productionOrders", "saleOrders", "settings", "accounts", "suppliers", "purchaseInvoices", "journalEntries", "journalLines"]) assert.match(source, new RegExp(`${table}:`));
  assert.doesNotMatch(source, /version\(4\)[\s\S]*?\.upgrade\([\s\S]*?\.clear\(/);
});
