import { multiplyMoney, roundQuantity } from "@/src/lib/money";

export function expectedShiftCash(input:{opening:number;cashSales:number;cashIn:number;cashRefunds:number;cashOut:number}) {
  return input.opening + input.cashSales + input.cashIn - input.cashRefunds - input.cashOut;
}
export function shiftDifference(actual:number, expected:number) {
  const difference=actual-expected;
  return {difference,status:difference<0?"shortage" as const:difference>0?"surplus" as const:"balanced" as const};
}
export function stockVariance(systemQuantity:number,actualQuantity:number,unitCostPiasters:number) {
  const differenceQuantity=roundQuantity(actualQuantity-systemQuantity);
  return {differenceQuantity,differenceValuePiasters:multiplyMoney(unitCostPiasters,differenceQuantity)};
}
export function foodCostPercent(cogsMinor:number,netSalesMinor:number) { return netSalesMinor>0?cogsMinor/netSalesMinor*100:0; }
export function costVariance(standardQuantity:number,actualQuantity:number,standardCostMinor:number,actualCostMinor:number) {
  return {quantityVariance:roundQuantity(actualQuantity-standardQuantity),costVarianceMinor:actualCostMinor-standardCostMinor};
}
