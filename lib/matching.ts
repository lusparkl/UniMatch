import type { Profile, Program, Requirement, Verification } from "./domain";
import { convert, fxSource } from "./fx";
export type Truth = "PASS" | "FAIL" | "UNKNOWN";
const FX_MARGIN = 0.05;
export type Check = {
  label: string;
  state: Truth;
  reason: string;
  // Rule type (or "ENGLISH" for the any-of English group); lets callers split tests from other checks.
  kind?: string;
  /** Official page behind the check, so an UNKNOWN can link to where it is resolved. */
  url?: string;
};
export type Scenario = {
  name: string;
  award: "NONE" | "COMPETITIVE" | "GUARANTEED";
  eligibility: Truth;
  remaining: number | null;
  currency: string | null;
  /** `remaining` in the student's budget currency when the program charges in another one. */
  converted: number | null;
  /**
   * With a partial total (tuition known, living or other costs missing), the least the student could pay:
   * tuition alone, less this scholarship's coverage and stipend. Null when even that is unknown.
   */
  lowerBound: number | null;
  /** `lowerBound` in the budget currency. */
  lowerBoundConverted: number | null;
  /** True when the total cost is incomplete, so `remaining` is null and only the lower bound is known. */
  partial: boolean;
  affordable: Truth;
  fullRide: boolean;
  reason: string;
};
export const combine = (states: Truth[]): Truth =>
  states.includes("FAIL")
    ? "FAIL"
    : !states.length || states.includes("UNKNOWN")
      ? "UNKNOWN"
      : "PASS";
export const trusted = (s: Verification) =>
  s === "ADMIN_VERIFIED" || s === "SOURCE_BACKED";
const eq = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
// Autumn, Fall and September name the same entry ("Sept", "September entry", "Sept 2027 entry").
// Admission round names ("regular round", "final") state no term and are left as they are.
const season = (term: string) =>
  /^\s*(autumn|fall|sept(ember)?)\b/i.test(term) ? "Fall" : term;
export const sameTerm = (a: string, b: string) => eq(season(a), season(b));
const FIELD_ALIASES: Record<string, string> = {
  ai: "artificial intelligence",
  cs: "computer science",
  it: "information technology",
  ml: "machine learning",
  econ: "economics",
  bba: "business administration",
};
const FIELD_NOISE = new Set(
  "a an and the of in for with bachelor bachelors master masters degree programme program scheme hons honours bsc ba beng msc ma".split(
    " ",
  ),
);
// Crude suffix stripping, applied identically to both sides: computer/computing, engineer/engineering.
const stem = (word: string) => {
  let w = word;
  for (let next = w; ; w = next) {
    next = w.replace(/(ings|ing|ers|er|ies|s)$/, "");
    if (next === w || next.length < 4) return w;
  }
};
const fieldWords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .flatMap((w) => (FIELD_ALIASES[w] ?? w).split(" "))
    .filter((w) => w && !FIELD_NOISE.has(w))
    .map(stem);
/** Every meaningful word of the student's field appears in the program's field or title. */
export function fieldMatches(
  program: { fieldOfStudy: string; title: string },
  field: string,
) {
  return fieldTier(program, field) > 0;
}
// The parts of a combined title: "Biotechnology and Business", "Business Administration - Accounting".
// Words inside parentheses are left out, so they can only ever count as a related field.
const conjuncts = (text: string) =>
  text
    .replace(/\([^)]*\)/g, " ")
    .split(/\band\b|&|\bwith\b|,|;|\/|\s[-–]\s/i)
    .map(fieldWords)
    .filter((part) => part.length);
function textTier(text: string, wanted: string[]): FieldTier {
  const words = fieldWords(text);
  if (!wanted.every((w) => words.includes(w))) return 0;
  if (new Set(words).size === new Set(wanted).size) return 1;
  const first = conjuncts(text)[0] ?? [];
  return wanted.every((w) => first.includes(w)) ? 2 : 3;
}
/**
 * How closely a program matches the student's field: 1 the field or title is the field, 2 the title leads
 * with it ("Business Administration" for "Business"), 3 the words appear only inside a combined title
 * ("Biotechnology and Business"), 0 no match. Tiers 1 and 2 pass the field check; 3 is a related field.
 */
export type FieldTier = 0 | 1 | 2 | 3;
export function fieldTier(
  program: { fieldOfStudy: string; title: string },
  field: string,
): FieldTier {
  const wanted = fieldWords(field);
  if (!wanted.length) return 0;
  const tiers = [program.fieldOfStudy, program.title]
    .map((t) => textTier(t, wanted))
    .filter((t) => t > 0);
  if (tiers.length) return Math.min(...tiers) as FieldTier;
  // Words split between the field and the title still relate, but never lead.
  const offered = new Set(
    fieldWords(program.fieldOfStudy + " " + program.title),
  );
  return wanted.every((w) => offered.has(w)) ? 3 : 0;
}
/** Evidence for another admission cycle never decides this one; the reason says which cycle it was. */
export const cycleReason = (evidenceYear: string, intakeYear: string) =>
  "Published for the " +
  evidenceYear +
  " cycle; " +
  intakeYear +
  " not yet published.";
export function evaluateRule(rule: Requirement, p: Profile): Check | null {
  if (
    rule.appliesToNationalities.length &&
    !rule.appliesToNationalities.some((n) => eq(n, p.nationality))
  )
    return null;
  if (rule.appliesToQualifications.length && !p.qualification)
    return {
      label: rule.label,
      state: "UNKNOWN",
      reason: "Qualification is needed to determine applicability.",
    };
  if (
    rule.appliesToQualifications.length &&
    !rule.appliesToQualifications.some((q) => eq(q, p.qualification))
  )
    return null;
  const result = (state: Truth, reason: string): Check => ({
    label: rule.label,
    state,
    reason,
    kind: rule.type,
    ...(rule.evidence?.url ? { url: rule.evidence.url } : {}),
  });
  if (
    rule.evidence?.academicYear &&
    rule.evidence.academicYear !== p.intake.slice(0, 4)
  )
    return result(
      "UNKNOWN",
      cycleReason(rule.evidence.academicYear, p.intake.slice(0, 4)),
    );
  if (!trusted(rule.status))
    return result(
      "UNKNOWN",
      "Evidence is " + rule.status.toLowerCase().replaceAll("_", " ") + ".",
    );
  const numeric: Record<string, number | null> = {
    IELTS: p.ielts,
    TOEFL: p.toefl,
    DUOLINGO: p.duolingo,
    PTE: p.pte,
    SAT: p.sat,
    ACT: p.act,
    GRE: p.gre,
    GMAT: p.gmat,
    GRADE: p.degreeLevel === "MASTER" ? (p.bachelorGpa ?? p.grade) : p.grade,
  };
  if (rule.type in numeric) {
    const value = numeric[rule.type];
    if (value === null || rule.minimum === null)
      return result("UNKNOWN", "A score or published threshold is missing.");
    if (
      rule.type === "GRADE" &&
      (!rule.scale || !eq(rule.scale, p.gradingScale))
    )
      return result(
        "UNKNOWN",
        "Grading equivalency is not verified. No GPA conversion was applied.",
      );
    return result(
      value >= rule.minimum ? "PASS" : "FAIL",
      value +
        " compared with published minimum " +
        rule.minimum +
        (rule.scale ? " (" + rule.scale + ")" : ""),
    );
  }
  const values: Record<string, string> = {
    QUALIFICATION: p.qualification,
    NATIONALITY: p.nationality,
    EDUCATION_COUNTRY: p.educationCountry,
    BACHELOR_FIELD: p.bachelorField,
  };
  if (rule.type in values) {
    const value = values[rule.type];
    if (!value || !rule.allowed.length)
      return result(
        "UNKNOWN",
        "Qualification, equivalency or eligibility list needs verification.",
      );
    // Only explicit published equivalencies belong in allowed.
    const accepted = rule.allowed.some((a) => eq(a, value));
    return result(
      accepted ? "PASS" : rule.type === "QUALIFICATION" ? "UNKNOWN" : "FAIL",
      !accepted && rule.type === "QUALIFICATION"
        ? "Qualification equivalency is not verified."
        : "Published accepted values: " + rule.allowed.join(", "),
    );
  }
  return result(
    "UNKNOWN",
    "This condition requires human review; it cannot be evaluated automatically.",
  );
}
const ENGLISH_TESTS = ["IELTS", "TOEFL", "DUOLINGO", "PTE"];
const TEST_NAMES: Record<string, string> = {
  IELTS: "IELTS",
  TOEFL: "TOEFL",
  DUOLINGO: "Duolingo",
  PTE: "PTE",
};
const ENGLISH_LABEL = "English proof (any one accepted test)";
// Alternatives that cannot be scored (a date-dependent TOEFL scale, an IB English grade) carry the
// group label as an OTHER rule; they keep a low score on another test from becoming a FAIL.
const isEnglish = (r: Requirement) =>
  ENGLISH_TESTS.includes(r.type) || r.label.startsWith(ENGLISH_LABEL);
/**
 * Accepted English tests are alternatives: one passing result satisfies the requirement.
 * A confirmed FAIL needs a result below the minimum for every accepted test; otherwise another
 * test could still qualify, so the answer stays UNKNOWN.
 */
export function evaluateEnglish(
  rules: Requirement[],
  p: Profile,
): Check | null {
  const checks = rules
    .map((rule) => ({ rule, check: evaluateRule(rule, p) }))
    .filter((c): c is { rule: Requirement; check: Check } => c.check !== null);
  if (!checks.length) return null;
  if (checks.length === 1) return checks[0].check;
  const label = ENGLISH_LABEL;
  const kind = "ENGLISH";
  const passed = checks.find((c) => c.check.state === "PASS");
  if (passed)
    return { label, kind, state: "PASS", reason: passed.check.reason };
  const url = checks.find((c) => c.check.url)?.check.url;
  const wanted = checks
    .map(
      ({ rule }) =>
        (TEST_NAMES[rule.type] ??
          (rule.label.slice(ENGLISH_LABEL.length).replace(/^[:\s]+/, "") ||
            rule.label)) + (rule.minimum !== null ? " " + rule.minimum : ""),
    )
    .join(", ");
  if (checks.every((c) => c.check.state === "FAIL"))
    return {
      label,
      kind,
      url,
      state: "FAIL",
      reason:
        "Every accepted test result is below its minimum (" + wanted + ").",
    };
  const below = checks.filter((c) => c.check.state === "FAIL");
  return {
    label,
    kind,
    url,
    state: "UNKNOWN",
    reason: below.length
      ? "Your result is below the minimum for some tests, but another accepted test could qualify: " +
        wanted +
        "."
      : "Add one result from: " + wanted + ".",
  };
}

export function matchProgram(
  program: Program,
  profile: Profile,
  now = new Date(),
) {
  const tier = fieldTier(program, profile.fieldOfStudy);
  const academic: Check[] = [
    {
      label: "Degree level",
      state: program.degreeLevel === profile.degreeLevel ? "PASS" : "FAIL",
      reason: program.degreeLevel.toLowerCase(),
    },
    {
      label: "Field of study",
      state: tier === 1 || tier === 2 ? "PASS" : "UNKNOWN",
      reason:
        tier === 3
          ? "Related field: " +
            program.fieldOfStudy +
            ". Your field is only part of this combined programme."
          : program.fieldOfStudy,
    },
  ];
  const application: Check[] = [];
  const mandatory = program.requirements.filter((r) => r.mandatory);
  const english = evaluateEnglish(mandatory.filter(isEnglish), profile);
  if (english) academic.push(english);
  for (const rule of mandatory.filter((r) => !isEnglish(r))) {
    const check = evaluateRule(rule, profile);
    if (check)
      (["NATIONALITY", "EDUCATION_COUNTRY"].includes(rule.type)
        ? application
        : academic
      ).push(check);
  }
  if (!program.requirementsComplete)
    academic.push({
      label: "Requirements completeness",
      state: "UNKNOWN",
      reason:
        "The complete set of mandatory requirements has not been verified.",
    });
  if (
    profile.degreeLevel === "MASTER" &&
    !program.requirements.some(
      (r) => r.type === "QUALIFICATION" || r.type === "BACHELOR_FIELD",
    )
  )
    academic.push({
      label: "Previous degree",
      state: "UNKNOWN",
      reason: "Master's prerequisite has not been verified.",
    });
  const [year, term] = profile.intake.split("-");
  const intakes = program.intakes.filter(
    (i) => i.academicYear === year && sameTerm(i.term, term),
  );
  const routes: Check[] = intakes.map((i) =>
    !trusted(i.status) || !i.deadline || !i.timezone
      ? {
          label: i.route,
          state: "UNKNOWN",
          reason: "Deadline or timezone is not verified.",
        }
      : new Date(i.deadline) < now
        ? {
            label: i.route,
            state: "FAIL",
            reason: "Application deadline has passed.",
          }
        : i.openDate && new Date(i.openDate) > now
          ? {
              label: i.route,
              state: "UNKNOWN",
              reason: "Applications have not opened yet.",
            }
          : {
              label: i.route,
              state: "PASS",
              reason:
                "Deadline " + new Date(i.deadline).toISOString().slice(0, 10),
            },
  );
  application.push({
    label: "Intake and application route",
    state: routes.some((r) => r.state === "PASS")
      ? "PASS"
      : routes.length && routes.every((r) => r.state === "FAIL")
        ? "FAIL"
        : "UNKNOWN",
    reason:
      routes.map((r) => r.label + ": " + r.reason).join("; ") ||
      "Requested intake is not verified.",
  });
  const intakeYear = profile.intake.slice(0, 4);
  const annual = program.costs.filter(
    (c) => trusted(c.status) && c.period === "ANNUAL",
  );
  const validCosts = annual.filter(
    (c) => !c.evidence?.academicYear || c.evidence.academicYear === intakeYear,
  );
  const otherCycle = validCosts.length
    ? null
    : (annual.find((c) => c.evidence?.academicYear)?.evidence?.academicYear ??
      null);
  // Rows may each quote one part (tuition from the fee page, living costs from the housing page). Parts
  // combine only in one currency; two different official figures for one part are a conflict, never averaged
  // and never resolved by picking one.
  const currency =
    validCosts.length &&
    validCosts.every((c) => c.currency === validCosts[0].currency)
      ? validCosts[0].currency
      : null;
  const part = (key: "tuition" | "living" | "other") => [
    ...new Set(validCosts.flatMap((c) => (c[key] === null ? [] : [c[key]]))),
  ];
  const parts = {
    tuition: part("tuition"),
    living: part("living"),
    other: part("other"),
  };
  const disagree =
    validCosts.length > 1 &&
    (currency === null || Object.values(parts).some((v) => v.length > 1));
  const known = (values: number[]) =>
    currency !== null && !disagree && values.length === 1 ? values[0] : null;
  const tuition = known(parts.tuition),
    living = known(parts.living),
    other = known(parts.other);
  const total =
    tuition !== null && living !== null && other !== null
      ? tuition + living + other
      : null;
  // The least the student could pay before aid is tuition alone (living and other costs are never negative).
  // With conflicting tuition figures in one currency, only the smallest bounds from below.
  const floorTuition =
    total === null && currency !== null && parts.tuition.length
      ? Math.min(...parts.tuition)
      : null;
  const partial = floorTuition !== null;
  // The amount in the student's budget currency; other currencies use the dated reference rate.
  const inBudget = (amount: number | null) =>
    amount === null || currency === null
      ? null
      : convert(amount, currency, profile.currency);
  const converted = currency !== null && currency !== profile.currency;
  const affordability = (amount: number | null): Truth => {
    const value = inBudget(amount);
    if (value === null) return "UNKNOWN";
    // A converted amount within the margin of the budget could fall either side on the payment day.
    if (
      converted &&
      Math.abs(value - profile.budget) <= FX_MARGIN * profile.budget
    )
      return "UNKNOWN";
    return value <= profile.budget ? "PASS" : "FAIL";
  };
  // Above the budget (plus the exchange-rate margin when converted) even before the unknown parts are added.
  const cutoff = profile.budget * (converted ? 1 + FX_MARGIN : 1);
  const floorFails = (amount: number | null) => {
    const value = inBudget(amount);
    return value !== null && value > cutoff;
  };
  const show = (value: number, code: string) =>
    Math.round(value).toLocaleString("en") + " " + code;
  const floorReason = (lead: string, amount: number) =>
    lead +
    show(amount, currency!) +
    (converted ? " ≈ " + show(inBudget(amount)!, profile.currency) : "") +
    ", above " +
    (converted
      ? show(cutoff, profile.currency) +
        " (your budget plus the " +
        FX_MARGIN * 100 +
        "% exchange-rate margin)."
      : "your budget of " + show(profile.budget, profile.currency) + ".");
  const conversionNote = (amount: number | null) => {
    const value = inBudget(amount);
    return converted && value !== null
      ? " About " +
          Math.round(value).toLocaleString("en") +
          " " +
          profile.currency +
          " at the " +
          fxSource.name +
          " rate of " +
          fxSource.date +
          "; results within " +
          FX_MARGIN * 100 +
          "% of your budget stay unknown."
      : "";
  };
  const disagreement = () =>
    "Official figures disagree: " +
    (currency === null
      ? "costs are quoted in different currencies"
      : (["tuition", "living", "other"] as const)
          .filter((k) => parts[k].length > 1)
          .map(
            (k) =>
              k + " " + parts[k].map((v) => show(v, currency)).join(" vs "),
          )
          .join("; ")) +
    ".";
  const noAidFails = partial && floorFails(floorTuition);
  const scenarios: Scenario[] = [
    {
      name: "Without scholarship",
      award: "NONE",
      eligibility: "PASS",
      remaining: total,
      currency,
      converted: converted ? inBudget(total) : null,
      lowerBound: floorTuition,
      lowerBoundConverted: converted ? inBudget(floorTuition) : null,
      partial,
      affordable:
        total !== null ? affordability(total) : noAidFails ? "FAIL" : "UNKNOWN",
      fullRide: false,
      reason:
        total !== null
          ? inBudget(total) === null
            ? "No reference rate for this currency; no conversion was assumed."
            : "Tuition + living expenses + mandatory costs." +
              conversionNote(total)
          : (disagree ? disagreement() + " " : "") +
            (noAidFails
              ? floorReason(
                  "Even tuition alone exceeds your budget: ",
                  floorTuition!,
                )
              : partial
                ? "Tuition is " +
                  show(floorTuition!, currency!) +
                  "; living or other mandatory costs are not verified, so the total is incomplete."
                : disagree
                  ? ""
                  : otherCycle
                    ? "Costs: " + cycleReason(otherCycle, intakeYear)
                    : "Complete, comparable annual costs are unavailable."),
    },
  ];
  for (const s of program.scholarships) {
    const checks = s.rules
      .filter((r) => r.mandatory)
      .map((r) => evaluateRule(r, profile))
      .filter((v): v is Check => v !== null);
    const eligibility = combine([
      ...checks.map((c) => c.state),
      checks.length ? "PASS" : "UNKNOWN",
      trusted(s.status) ? "PASS" : "UNKNOWN",
      s.deadline ? (new Date(s.deadline) < now ? "FAIL" : "PASS") : "UNKNOWN",
    ]);
    // A stipend in another currency is converted to the cost's currency at the reference rate.
    const stipend =
      s.stipendAmount === 0
        ? 0
        : s.stipendAmount !== null && s.currency && currency
          ? convert(s.stipendAmount, s.currency, currency)
          : null;
    const remaining =
      total !== null && s.tuitionCoverage !== null && stipend !== null
        ? Math.max(0, total - tuition! * s.tuitionCoverage - stipend)
        : null;
    const lowerBound =
      partial && s.tuitionCoverage !== null && stipend !== null
        ? Math.max(0, floorTuition! * (1 - s.tuitionCoverage) - stipend)
        : null;
    const boundFails = floorFails(lowerBound);
    const guaranteed =
      s.fundingCategory === "GUARANTEED" &&
      s.status === "ADMIN_VERIFIED" &&
      eligibility === "PASS";
    scenarios.push({
      name: s.name,
      award: guaranteed ? "GUARANTEED" : "COMPETITIVE",
      eligibility,
      remaining,
      currency,
      converted: converted ? inBudget(remaining) : null,
      lowerBound,
      lowerBoundConverted: converted ? inBudget(lowerBound) : null,
      partial,
      affordable:
        eligibility === "FAIL" || boundFails
          ? "FAIL"
          : eligibility === "UNKNOWN"
            ? "UNKNOWN"
            : affordability(remaining),
      fullRide: remaining === 0 && total !== null && total > 0,
      reason:
        (guaranteed
          ? "Published guaranteed funding; confirm award terms."
          : "Eligibility to apply is not an award. ") +
        checks.map((c) => c.reason).join(" ") +
        (boundFails
          ? " " +
            floorReason(
              "Even with this award, tuition alone leaves ",
              lowerBound!,
            )
          : conversionNote(remaining)),
    });
  }
  const suitable = scenarios.filter(
    (s) =>
      s.eligibility !== "FAIL" &&
      (profile.funding === "FULL_RIDE"
        ? s.fullRide || (s.award !== "NONE" && s.remaining === null)
        : profile.funding === "TUITION"
          ? s.award !== "NONE" &&
            program.scholarships.some(
              (x) =>
                x.name === s.name &&
                (x.tuitionCoverage === 1 || x.tuitionCoverage === null),
            )
          : true),
  );
  // A partial total never passes. It fails only when the lower bound already rules out every option the
  // funding preference allows (or, when none is allowed, every option there is).
  const financial: Truth = suitable.some(
    (s) =>
      s.affordable === "PASS" &&
      s.award !== "COMPETITIVE" &&
      s.eligibility === "PASS",
  )
    ? "PASS"
    : suitable.some(
          (s) => s.affordable === "UNKNOWN" || s.affordable === "PASS",
        )
      ? "UNKNOWN"
      : total !== null
        ? "FAIL"
        : partial &&
            (suitable.length ? suitable : scenarios).every(
              (s) => s.affordable === "FAIL",
            )
          ? "FAIL"
          : "UNKNOWN";
  const academicState = combine(academic.map((c) => c.state)),
    applicationState = combine(application.map((c) => c.state));
  const status = combine([academicState, applicationState, financial]);
  return {
    program,
    academic,
    application,
    academicState,
    applicationState,
    financial,
    status,
    scenarios,
    fieldTier: tier,
    completeness: [...academic, ...application].filter(
      (c) => c.state !== "UNKNOWN",
    ).length,
  };
}
export type Match = ReturnType<typeof matchProgram>;
// Leading-field programmes first, then related fields, then the rest.
const fieldRank = (tier: FieldTier) =>
  tier === 1 || tier === 2 ? 0 : tier === 3 ? 1 : 2;
export const compareMatches = (a: Match, b: Match) =>
  Number(a.status === "FAIL") - Number(b.status === "FAIL") ||
  fieldRank(a.fieldTier) - fieldRank(b.fieldTier) ||
  { PASS: 0, UNKNOWN: 1, FAIL: 2 }[a.financial] -
    { PASS: 0, UNKNOWN: 1, FAIL: 2 }[b.financial] ||
  b.completeness - a.completeness ||
  (b.program.lastResearched ?? "").localeCompare(
    a.program.lastResearched ?? "",
  );
