import { writeFileSync } from "node:fs";
// Refreshes lib/fx-rates.json from the National Bank of Ukraine's official daily rates, which cover every
// budget currency the profile offers (including UAH). Run manually; matching never fetches rates itself.
const url = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json";
const wanted = ["USD", "EUR", "HKD", "HUF", "SGD", "GBP", "INR", "KRW"];
const rows = (await (await fetch(url)).json()) as {
  cc: string;
  rate: number;
  exchangedate: string;
}[];
const rates: Record<string, number> = { UAH: 1 };
for (const cc of wanted) {
  const row = rows.find((r) => r.cc === cc);
  if (!row) throw new Error(`No ${cc} rate in ${url}`);
  rates[cc] = row.rate;
}
const [day, month, year] = rows[0].exchangedate.split(".");
writeFileSync(
  new URL("../lib/fx-rates.json", import.meta.url),
  JSON.stringify(
    {
      source: "National Bank of Ukraine",
      url,
      date: `${year}-${month}-${day}`,
      unit: "UAH per 1 unit of currency",
      rates,
    },
    null,
    2,
  ) + "\n",
);
console.log(`${year}-${month}-${day}`, rates);
