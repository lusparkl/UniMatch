import type { Profile, Program, Requirement, Verification } from "./domain";
export type Truth = "PASS" | "FAIL" | "UNKNOWN";
export type Check = { label: string; state: Truth; reason: string };
export type Scenario = {
  name: string;
  award: "NONE" | "COMPETITIVE" | "GUARANTEED";
  eligibility: Truth;
  remaining: number | null;
  currency: string | null;
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
      state: eq(program.fieldOfStudy, profile.fieldOfStudy)
        ? "PASS"
        : "UNKNOWN",
      reason: program.fieldOfStudy,
    },
  ];
  const application: Check[] = [];
  for (const rule of program.requirements.filter((r) => r.mandatory)) {
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
    (i) => i.academicYear === year && eq(i.term, term),
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
  const affordability = (amount: number | null): Truth =>
    amount === null || currency !== profile.currency
      ? "UNKNOWN"
      : amount <= profile.budget
        ? "PASS"
        : "FAIL";
  const scenarios: Scenario[] = [
    {
      name: "Without scholarship",
      award: "NONE",
      eligibility: "PASS",
      remaining: total,
      currency,
      affordable: affordability(total),
      fullRide: false,
      reason:
        total === null
          ? "Complete, comparable annual costs are unavailable."
          : currency !== profile.currency
            ? "Currency differs from your budget; no exchange rate has been assumed."
            : "Tuition + living expenses + mandatory costs.",
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
    const comparable =
      cost &&
      s.tuitionCoverage !== null &&
      s.stipendAmount !== null &&
      (s.stipendAmount === 0 || s.currency === currency);
    const remaining =
      total !== null && comparable
        ? Math.max(
            0,
            total - cost!.tuition! * s.tuitionCoverage! - s.stipendAmount!,
          )
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
        checks.map((c) => c.reason).join(" "),
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
