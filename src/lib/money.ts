export const roundQuantity = (value: number) =>
  Math.round((value + Number.EPSILON) * 1000) / 1000;

export const multiplyMoney = (piasters: number, quantity: number) =>
  Math.round(piasters * quantity);

export const formatMoney = (piasters: number, locale = "ar-EG") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  }).format(piasters / 100);

export const formatQuantity = (quantity: number, locale = "ar-EG") =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(quantity);
