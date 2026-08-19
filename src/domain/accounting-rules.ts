export interface PostingLineSpec {
  accountCode: string;
  debitMinor: number;
  creditMinor: number;
  description: string;
}

const line = (accountCode: string, debitMinor: number, creditMinor: number, description: string): PostingLineSpec => ({ accountCode, debitMinor, creditMinor, description });

export function validateJournalLines(lines: PostingLineSpec[]) {
  if (lines.length < 2) throw new Error("القيد يجب أن يحتوي على طرفين على الأقل");
  let debit = 0, credit = 0;
  for (const entry of lines) {
    if (!Number.isInteger(entry.debitMinor) || !Number.isInteger(entry.creditMinor) || entry.debitMinor < 0 || entry.creditMinor < 0) throw new Error("قيم القيد يجب أن تكون أعدادًا صحيحة غير سالبة");
    if ((entry.debitMinor > 0) === (entry.creditMinor > 0)) throw new Error("سطر القيد يجب أن يكون مدينًا أو دائنًا فقط");
    debit += entry.debitMinor; credit += entry.creditMinor;
  }
  if (debit !== credit) throw new Error(`القيد غير متوازن: المدين ${debit} والدائن ${credit}`);
  return { debitMinor: debit, creditMinor: credit };
}

export function buildPurchaseJournalLines(input: { inventoryMinor: number; vatMinor: number; paidMinor: number; totalMinor: number; paymentAccountCode?: string; isReturn?: boolean }) {
  const payable = input.totalMinor - input.paidMinor; const sign = input.isReturn ? -1 : 1; const lines: PostingLineSpec[] = [];
  const add = (code: string, debit: number, credit: number, text: string) => lines.push(sign > 0 ? line(code, debit, credit, text) : line(code, credit, debit, text));
  add("1210", input.inventoryMinor, 0, input.isReturn ? "مرتجع مشتريات" : "مخزون مشتريات");
  if (input.vatMinor) add("2190", input.vatMinor, 0, "ضريبة مدخلات");
  if (input.paidMinor) add(input.paymentAccountCode ?? "1110", 0, input.paidMinor, "الجزء المدفوع");
  if (payable) add("2110", 0, payable, "رصيد المورد");
  validateJournalLines(lines); return lines;
}

export function buildSupplierPaymentLines(amountMinor: number, paymentAccountCode = "1110") { const lines = [line("2110", amountMinor, 0, "سداد مورد"), line(paymentAccountCode, 0, amountMinor, "صرف سداد مورد")]; validateJournalLines(lines); return lines; }
export function buildExpenseLines(input: { expenseAccountCode: string; amountMinor: number; vatMinor: number; paymentAccountCode: string }) { const lines = [line(input.expenseAccountCode, input.amountMinor, 0, "مصروف تشغيل")]; if (input.vatMinor) lines.push(line("2190", input.vatMinor, 0, "ضريبة مدخلات")); lines.push(line(input.paymentAccountCode, 0, input.amountMinor + input.vatMinor, "سداد المصروف")); validateJournalLines(lines); return lines; }
export function buildStockTransferLines(valueMinor: number) { const lines = [line("1220", valueMinor, 0, "نقل إلى المطبخ"), line("1210", 0, valueMinor, "صرف مخزون خام")]; validateJournalLines(lines); return lines; }
export function buildProductionLines(valueMinor: number) { const lines = [line("1230", valueMinor, 0, "إنتاج منتج تام"), line("1220", 0, valueMinor, "استهلاك مخزون المطبخ")]; validateJournalLines(lines); return lines; }
export function buildSaleLines(input: { subtotalMinor: number; vatMinor: number; totalMinor: number; cogsMinor: number; paymentAccountCode: string; revenueAccountCode?: string }) { const lines = [line(input.paymentAccountCode, input.totalMinor, 0, "تحصيل مبيعات"), line(input.revenueAccountCode ?? "4100", 0, input.subtotalMinor, "إيراد المبيعات")]; if (input.vatMinor) lines.push(line("2200", 0, input.vatMinor, "ضريبة مخرجات")); if (input.cogsMinor) { lines.push(line("5100", input.cogsMinor, 0, "تكلفة المبيعات"), line("1230", 0, input.cogsMinor, "صرف منتج تام")); } validateJournalLines(lines); return lines; }
export function buildCashTransferLines(amountMinor: number, fromAccountCode: string, toAccountCode: string) { const lines = [line(toAccountCode, amountMinor, 0, "تحويل نقدي وارد"), line(fromAccountCode, 0, amountMinor, "تحويل نقدي صادر")]; validateJournalLines(lines); return lines; }
export function buildShiftDifferenceLines(differenceMinor: number) { if (!differenceMinor) return []; const amount = Math.abs(differenceMinor); const lines = differenceMinor < 0 ? [line("6270", amount, 0, "عجز كاشير"), line("1120", 0, amount, "تسوية عجز الكاشير")] : [line("1120", amount, 0, "تسوية زيادة الكاشير"), line("7100", 0, amount, "فائض كاشير")]; validateJournalLines(lines); return lines; }

export function summarizeTrialBalance(lines: Array<{ accountId: string; debitMinor: number; creditMinor: number }>) { const rows = new Map<string, { debitMinor: number; creditMinor: number; balanceMinor: number }>(); for (const item of lines) { const row = rows.get(item.accountId) ?? { debitMinor: 0, creditMinor: 0, balanceMinor: 0 }; row.debitMinor += item.debitMinor; row.creditMinor += item.creditMinor; row.balanceMinor = row.debitMinor - row.creditMinor; rows.set(item.accountId, row); } const debitMinor = [...rows.values()].reduce((sum, row) => sum + row.debitMinor, 0); const creditMinor = [...rows.values()].reduce((sum, row) => sum + row.creditMinor, 0); return { rows, debitMinor, creditMinor, balanced: debitMinor === creditMinor }; }

export function calculateProfitLoss(rows: Array<{ type: string; balanceMinor: number }>) {
  const debit = (type: string) => rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.balanceMinor, 0);
  const credit = (type: string) => -debit(type);
  const revenueMinor = credit("revenue"); const contraRevenueMinor = debit("contra_revenue"); const netRevenueMinor = revenueMinor - contraRevenueMinor;
  const costOfSalesMinor = debit("cost_of_sales"); const grossProfitMinor = netRevenueMinor - costOfSalesMinor; const operatingExpensesMinor = debit("expense"); const otherIncomeMinor = credit("other_income");
  return { revenueMinor, contraRevenueMinor, netRevenueMinor, costOfSalesMinor, grossProfitMinor, operatingExpensesMinor, otherIncomeMinor, netProfitMinor: grossProfitMinor - operatingExpensesMinor + otherIncomeMinor };
}

export function calculateBalanceSheet(rows: Array<{ type: string; balanceMinor: number }>) {
  const total = (type: string, creditNature = false) => rows.filter((row) => row.type === type).reduce((sum, row) => sum + (creditNature ? -row.balanceMinor : row.balanceMinor), 0);
  const assetsMinor = total("asset"), liabilitiesMinor = total("liability", true), equityMinor = total("equity", true); const profit = calculateProfitLoss(rows).netProfitMinor; const liabilitiesAndEquityMinor = liabilitiesMinor + equityMinor + profit;
  return { assetsMinor, liabilitiesMinor, equityMinor, currentProfitMinor: profit, liabilitiesAndEquityMinor, balanced: assetsMinor === liabilitiesAndEquityMinor };
}
