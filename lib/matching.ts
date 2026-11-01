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
};
export type Scenario = {
  name: string;
  award: "NONE" | "COMPETITIVE" | "GUARANTEED";
  eligibility: Truth;
  remaining: number | null;
  currency: string | null;
  /** `remaining` in the student's budget currency when the program charges in another one. */
  converted: number | null;
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
// Autumn and Fall name the same September entry.
const season = (term: string) => (eq(term, "Autumn") ? "Fall" : term);
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
  const wanted = fieldWords(field);
  const offered = new Set(
    fieldWords(program.fieldOfStudy + " " + program.title),
  );
  return wanted.length > 0 && wanted.every((w) => offered.has(w));
}
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
  });
  if (
    rule.evidence?.academicYear &&
    rule.evidence.academicYear !== p.intake.slice(0, 4)
  )
    return result("UNKNOWN", "Evidence refers to a different academic year.");
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
      state: "FAIL",
      reason:
        "Every accepted test result is below its minimum (" + wanted + ").",
    };
  const below = checks.filter((c) => c.check.state === "FAIL");
  return {
    label,
    kind,
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
  const academic: Check[] = [
    {
      label: "Degree level",
      state: program.degreeLevel === profile.degreeLevel ? "PASS" : "FAIL",
      reason: program.degreeLevel.toLowerCase(),
    },
    {
      label: "Field of study",
      state: fieldMatches(program, profile.fieldOfStudy) ? "PASS" : "UNKNOWN",
      reason: program.fieldOfStudy,
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
  const validCosts = program.costs.filter(
    (c) =>
      trusted(c.status) &&
      c.period === "ANNUAL" &&
      (!c.evidence?.academicYear ||
        c.evidence.academicYear === profile.intake.slice(0, 4)),
  );
  // Multiple differing estimates are uncertain, never select the cheapest.
  const cost = validCosts.length === 1 ? validCosts[0] : undefined;
  const total =
    cost && cost.tuition !== null && cost.living !== null && cost.other !== null
      ? cost.tuition + cost.living + cost.other
      : null;
  const currency = cost?.currency ?? null;
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
  const scenarios: Scenario[] = [
    {
      name: "Without scholarship",
      award: "NONE",
      eligibility: "PASS",
      remaining: total,
      currency,
      converted: converted ? inBudget(total) : null,
      affordable: affordability(total),
      fullRide: false,
      reason:
        total === null
          ? "Complete, comparable annual costs are unavailable."
          : inBudget(total) === null
            ? "No reference rate for this currency; no conversion was assumed."
            : "Tuition + living expenses + mandatory costs." +
              conversionNote(total),
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
      total !== null && cost && s.tuitionCoverage !== null && stipend !== null
        ? Math.max(0, total - cost.tuition! * s.tuitionCoverage - stipend)
        : null;
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
      affordable:
        eligibility === "FAIL"
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
        conversionNote(remaining),
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
      : total === null
        ? "UNKNOWN"
        : "FAIL";
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
    completeness: [...academic, ...application].filter(
      (c) => c.state !== "UNKNOWN",
    ).length,
  };
}
export type Match = ReturnType<typeof matchProgram>;
export const compareMatches = (a: Match, b: Match) =>
  Number(a.status === "FAIL") - Number(b.status === "FAIL") ||
  Number(b.academic[1].state === "PASS") -
    Number(a.academic[1].state === "PASS") ||
  { PASS: 0, UNKNOWN: 1, FAIL: 2 }[a.financial] -
    { PASS: 0, UNKNOWN: 1, FAIL: 2 }[b.financial] ||
  b.completeness - a.completeness ||
  (b.program.lastResearched ?? "").localeCompare(
    a.program.lastResearched ?? "",
  );
