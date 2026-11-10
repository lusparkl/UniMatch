import type { Profile, Program } from "./domain";
import { fxSource, rate } from "./fx";
import {
  annualCost,
  FX_MARGIN,
  trusted,
  type Match,
  type Truth,
} from "./matching";

// The cost arithmetic behind a financial result, as lines a student can follow and check against sources.
// Built only from the engine's own results (annualCost and the match's scenarios): nothing is recomputed
// differently here.
export type Line = {
  label: string;
  value: string;
  detail?: string;
  url?: string;
  retrievedAt?: string;
  state?: Truth;
};
export type Arithmetic = {
  currency: string | null;
  parts: Line[];
  total: Line;
  exchange: Line | null;
  budget: Line;
  scenarios: { name: string; lines: Line[] }[];
};
/** Currency amounts with unambiguous symbols (US$, HK$), the same everywhere in the app. */
export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
const PARTS = [
  ["tuition", "Tuition"],
  ["living", "Living expenses"],
  ["other", "Other mandatory costs"],
] as const;

export function arithmetic(
  program: Program,
  profile: Profile,
  match: Match,
): Arithmetic {
  const year = profile.intake.slice(0, 4);
  const cost = annualCost(program, year);
  const currency = cost.currency;
  const rows = program.costs.filter(
    (c) =>
      trusted(c.status) &&
      c.period === "ANNUAL" &&
      (!c.evidence?.academicYear || c.evidence.academicYear === year),
  );
  const parts: Line[] = PARTS.map(([key, label]) => {
    const value = cost[key];
    const source = rows.find((r) => r[key] !== null)?.evidence;
    return {
      label,
      value:
        value !== null && currency
          ? money(value, currency)
          : cost.parts[key].length > 1
            ? "Official figures disagree"
            : "Not verified",
      ...(source ? { url: source.url, retrievedAt: source.retrievedAt } : {}),
    };
  });
  const total: Line = {
    label: "Total per year",
    value:
      cost.total !== null && currency
        ? money(cost.total, currency)
        : cost.tuition !== null
          ? "Incomplete: only tuition is verified"
          : "Not verified",
  };
  const converted = !!currency && currency !== profile.currency;
  // One unit of the budget currency, in the cost currency.
  const perUnit = converted ? rate(profile.currency, currency) : null;
  const exchange: Line | null = converted
    ? {
        label: "Exchange rate",
        value:
          perUnit === null
            ? "No reference rate"
            : `1 ${profile.currency} = ${perUnit.toFixed(perUnit < 10 ? 3 : 1)} ${currency}`,
        detail: `${fxSource.name} reference rate of ${fxSource.date}`,
      }
    : null;
  const budget: Line = {
    label: "Your budget",
    value: money(profile.budget, profile.currency),
    ...(converted
      ? {
          detail: `Converted amounts between ${money(profile.budget * (1 - FX_MARGIN), profile.currency)} and ${money(profile.budget * (1 + FX_MARGIN), profile.currency)} stay UNKNOWN: the rate on the payment day will differ.`,
        }
      : {}),
  };
  const inBudget = (amount: number, inCurrency: number | null) =>
    converted && perUnit !== null && inCurrency !== null
      ? `${money(amount, currency!)} ÷ ${perUnit.toFixed(perUnit < 10 ? 3 : 1)} = ${money(inCurrency, profile.currency)}`
      : money(amount, currency!);
  const cutoff = profile.budget * (converted ? 1 + FX_MARGIN : 1);
  const scenarios = match.scenarios.map((s) => {
    const lines: Line[] = [];
    const award = program.scholarships.find((x) => x.name === s.name);
    const base = s.partial ? cost.tuition : cost.total;
    if (award && currency && base !== null) {
      if (award.tuitionCoverage)
        lines.push({
          label: `Tuition coverage ${Math.round(award.tuitionCoverage * 100)}%`,
          value:
            "−" + money((cost.tuition ?? 0) * award.tuitionCoverage, currency),
        });
      if (award.stipendAmount && award.currency)
        lines.push({
          label: "Annual stipend",
          value: "−" + money(award.stipendAmount, award.currency),
        });
    }
    if (s.remaining !== null && currency)
      lines.push({
        label: award ? "Remaining after this award" : "Remaining",
        value: inBudget(s.remaining, s.converted),
        state: s.affordable,
      });
    else if (s.partial && s.lowerBound !== null && currency) {
      const value = s.lowerBoundConverted ?? s.lowerBound;
      const fails = s.affordable === "FAIL" && value > cutoff;
      lines.push({
        label: award ? "At least, after this award" : "At least (tuition only)",
        value:
          inBudget(s.lowerBound, s.lowerBoundConverted) +
          (fails
            ? ` > ${money(cutoff, profile.currency)} → FAIL before ${award ? "the rest of the costs" : "any aid"}`
            : ""),
        state: fails ? "FAIL" : "UNKNOWN",
      });
    } else
      lines.push({
        label: "Remaining",
        value: "Unknown: costs are not verified",
        state: "UNKNOWN",
      });
    return { name: s.name, lines };
  });
  return { currency, parts, total, exchange, budget, scenarios };
}
