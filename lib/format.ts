const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tonnageFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const bagsFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const safeNumber = (value: number) => (Number.isFinite(value) ? value : 0);

export const formatMoney = (value: number) => moneyFormatter.format(safeNumber(value));

export const formatRate = (value: number) => moneyFormatter.format(safeNumber(value));

export const formatTonnage = (value: number) => tonnageFormatter.format(safeNumber(value));

export const formatBags = (value: number) => bagsFormatter.format(safeNumber(value));
