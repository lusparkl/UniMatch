import table from "./fx-rates.json";
// Dated official reference rates (scripts/update-fx.ts). Converted amounts are estimates: a bank's
// rate on the payment day will differ, so matching treats near-budget results as unknown.
const rates: Record<string, number> = table.rates;
export const fxSource = { name: table.source, date: table.date };
export function convert(amount: number, from: string, to: string) {
  if (from === to) return amount;
  const a = rates[from],
    b = rates[to];
  return a && b ? (amount * a) / b : null;
}
