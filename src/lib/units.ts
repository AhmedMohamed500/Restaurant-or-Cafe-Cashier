export type UnitFamily = "mass" | "volume" | "count";

export function convertUnitQuantity(quantity: number, fromFactor: number, toFactor: number) {
  if (quantity <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر");
  if (fromFactor <= 0 || toFactor <= 0) throw new Error("معامل التحويل يجب أن يكون أكبر من صفر");
  return Math.round((((quantity * fromFactor) / toFactor) + Number.EPSILON) * 1000) / 1000;
}

export function assertCompatibleUnitFamilies(from: UnitFamily, to: UnitFamily) {
  if (from !== to) throw new Error("لا يمكن التحويل بين وحدات الوزن ووحدة العدد");
}
