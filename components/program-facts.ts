import { BadgeCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Profile, Program } from "@/lib/domain";
import {
  annualCost,
  sameTerm,
  trusted,
  type Match,
  type Truth,
} from "@/lib/matching";
import { money as formatMoney } from "@/lib/arithmetic";
import { convert } from "@/lib/fx";
import { deadlineParts } from "@/lib/places";
import { programTier } from "@/lib/trust";

// The facts a programme card, detail page and comparison share, each as a headline value and a short
// explanation, so every screen words them the same way.

export const statusLabel: Record<Truth, string> = {
  PASS: "Published minimums met",
  UNKNOWN: "Needs verification",
  FAIL: "Requirements not met",
};
/** The overall status words; a FAIL caused only by money says so instead of "Requirements not met". */
export const statusText = (m: Match) =>
  m.status === "FAIL" &&
  m.academicState !== "FAIL" &&
  m.applicationState !== "FAIL"
    ? "Above your budget"
    : statusLabel[m.status];

const money = (amount: number, currency: string) =>
  formatMoney(amount, currency);
/** " (≈ US$30,590)" when an amount is charged in a currency other than the student's budget currency. */
export const approx = (
  amount: number,
  currency: string | null,
  target: string | null | undefined,
) => {
  const value =
    currency && target && currency !== target
      ? convert(amount, currency, target)
      : null;
  return value === null ? "" : " (≈ " + money(value, target!) + ")";
};

export type Fact = { value: string; sub: string };

/** Annual cost before aid: the full total when known, otherwise only the verified part, never a guess. */
export function costFact(
  program: Program,
  intakeYear: string,
  target?: string | null,
): Fact & { kind: "full" | "partial" | "conflict" | "none" } {
  const cost = annualCost(program, intakeYear);
  if (cost.total !== null && cost.currency)
    return {
      kind: "full",
      value:
        money(cost.total, cost.currency) +
        approx(cost.total, cost.currency, target),
      sub: "Tuition and living costs",
    };
  if (cost.disagree || program.costs.some((c) => c.status === "CONFLICTING"))
    return {
      kind: "conflict",
      value: "Needs verification",
      sub: "Official pages disagree on this cost",
    };
  const known = cost.tuition ?? cost.living;
  if (known !== null && cost.currency)
    return {
      kind: "partial",
      value:
        "Partial · " +
        (cost.tuition !== null ? "tuition " : "living ") +
        money(known, cost.currency) +
        approx(known, cost.currency, target) +
        " only",
      sub: "Total not verified",
    };
  return {
    kind: "none",
    value: "Not verified",
    sub: program.costs.some((c) => trusted(c.status) && c.period === "SEMESTER")
      ? "Only a per-semester fee is published"
      : "No cost published for this program",
  };
}

export function fundingFact(program: Program): Fact {
  const n = program.scholarships.length;
  return n
    ? {
        value: n + " funding option" + (n > 1 ? "s" : ""),
        sub: program.scholarships.some(
          (s) => s.fundingCategory === "GUARANTEED",
        )
          ? "Includes guaranteed terms · conditions apply"
          : "Competitive · conditions apply",
      }
    : { value: "None verified", sub: "Check the official page" };
}

/** Trusted rounds with a deadline for the student's intake (every intake without a profile), earliest first. */
export function rounds(program: Program, profile: Profile | null) {
  const [year, term] = profile ? profile.intake.split("-") : [];
  return program.intakes
    .filter(
      (i) =>
        trusted(i.status) &&
        i.deadline &&
        (!profile ||
          (i.academicYear === year &&
            (i.term.toUpperCase() === "UNKNOWN" || sameTerm(i.term, term)))),
    )
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
}
/** The next open round, else the last one that passed, else null. */
export function nextRound(
  program: Program,
  profile: Profile | null,
  now: Date,
) {
  const all = rounds(program, profile);
  const intake =
    all.find((i) => new Date(i.deadline!) >= now) ?? all.at(-1) ?? null;
  return intake
    ? { intake, when: deadlineParts(intake.deadline!, intake.timezone, now) }
    : null;
}
export function deadlineFact(
  program: Program,
  profile: Profile | null,
  now: Date | null,
): Fact {
  const next = now && nextRound(program, profile, now);
  if (!next)
    return {
      value: "Not verified",
      sub: now ? "No round found for your intake" : "",
    };
  return {
    value: next.when.date,
    sub:
      next.when.time +
      (next.intake.timezone ? "" : " · time zone not stated") +
      " · " +
      next.when.days,
  };
}
/** The international route a programme is applied through: the round name before any colon. */
export function routeOf(program: Program, profile: Profile | null) {
  const intake =
    rounds(program, profile)[0] ??
    program.intakes.find((i) => trusted(i.status));
  return intake ? intake.route.split(":")[0] : "International admissions";
}
const trustIcons = { 1: BadgeCheck, 2: ShieldCheck, 3: ShieldAlert };
const trustWords = {
  1: "Human-reviewed",
  2: "Auto-verified from official source",
  3: "Some facts not yet verified",
};
/** Who checked a whole programme: its weakest fact sets the tier. */
export function programTrust(program: Program) {
  const tier = programTier(program);
  return { tier, label: trustWords[tier], Icon: trustIcons[tier] };
}
