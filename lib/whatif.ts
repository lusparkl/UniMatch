import type { Profile, Program } from "./domain";
import { SCORE_FIELDS, type Action } from "./actions";
import { money } from "./arithmetic";
import { matchProgram, type Check, type Match, type Truth } from "./matching";

// "What would change this?": one minimal change at a time, re-run through the same engine. A suggestion is
// returned only when the re-run improves the state it is about (FAIL to UNKNOWN or PASS, UNKNOWN to PASS).
// The text is hypothetical, never advice. A missing input becomes an action to add it instead.
export type Suggestion = {
  dimension: "academic" | "application" | "financial";
  text: string;
  action?: Action;
};
const rank: Record<Truth, number> = { FAIL: 0, UNKNOWN: 1, PASS: 2 };
const better = (after: Truth, before: Truth) => rank[after] > rank[before];
const verdict: Record<Truth, string> = {
  PASS: "would pass",
  UNKNOWN: "would no longer fail (it would still need verification)",
  FAIL: "would still fail",
};
const ENGLISH_TESTS = ["IELTS", "TOEFL", "DUOLINGO", "PTE"];
const englishCheck = (m: Match) =>
  m.academic.find(
    (c) => c.kind === "ENGLISH" || ENGLISH_TESTS.includes(c.kind ?? ""),
  );
const checkFor = (m: Match, label: string): Check | undefined =>
  m.academic.find((c) => c.label === label);
const FUNDING_STEP: Partial<Record<Profile["funding"], Profile["funding"]>> = {
  FULL_RIDE: "TUITION",
  TUITION: "PARTIAL",
};
const FUNDING_NAME: Record<Profile["funding"], string> = {
  FULL_RIDE: "a full ride",
  TUITION: "full tuition cover",
  PARTIAL: "partial aid",
  NONE: "no aid",
};
const TERMS: Record<string, string> = {
  fall: "Fall",
  autumn: "Fall",
  spring: "Spring",
  winter: "Winter",
  summer: "Summer",
};
const season = (term: string) =>
  /^sept/i.test(term.trim()) ? "Fall" : TERMS[term.trim().toLowerCase()];

export function suggestions(
  program: Program,
  profile: Profile,
  now = new Date(),
): Suggestion[] {
  const run = (p: Profile) => matchProgram(program, p, now);
  const before = run(profile);
  const out: Suggestion[] = [];
  const mandatory = program.requirements.filter((r) => r.mandatory);

  // English: raise the score of a test the student has; with none, ask for one.
  const english = englishCheck(before);
  if (english && english.state !== "PASS") {
    const tests = mandatory.filter(
      (r) => ENGLISH_TESTS.includes(r.type) && r.minimum !== null,
    );
    const held = tests.filter(
      (r) => profile[SCORE_FIELDS[r.type].field] !== null,
    );
    if (!held.length && tests.length) {
      const first = SCORE_FIELDS[tests[0].type];
      out.push({
        dimension: "academic",
        text:
          "Add an English test score. Accepted here: " +
          tests
            .map((r) => SCORE_FIELDS[r.type].name + " " + r.minimum)
            .join(", ") +
          ".",
        action: {
          label: "Add your " + first.name + " score",
          href: "/profile#" + first.field,
          external: false,
        },
      });
    }
    for (const r of held) {
      const { field, name } = SCORE_FIELDS[r.type];
      const current = profile[field] as number;
      if (current >= r.minimum!) continue;
      const after = englishCheck(run({ ...profile, [field]: r.minimum }));
      if (after && better(after.state, english.state))
        out.push({
          dimension: "academic",
          text: `If your ${name} were ${r.minimum} (now ${current}), the English check ${verdict[after.state]}.`,
        });
    }
  }

  // SAT, ACT and grades: raise to the published minimum, or ask for the missing score.
  for (const r of mandatory.filter(
    (r) => ["SAT", "ACT", "GRADE"].includes(r.type) && r.minimum !== null,
  )) {
    const check = checkFor(before, r.label);
    if (!check || check.state === "PASS") continue;
    const { field, name } = SCORE_FIELDS[r.type];
    const value = profile[field] as number | null;
    if (value === null) {
      out.push({
        dimension: "academic",
        text: `Add your ${name} to compare it with the published minimum of ${r.minimum}.`,
        action: {
          label: "Add your " + name,
          href: "/profile#" + field,
          external: false,
        },
      });
      continue;
    }
    if (value >= r.minimum!) continue;
    const after = checkFor(run({ ...profile, [field]: r.minimum }), r.label);
    if (after && better(after.state, check.state))
      out.push({
        dimension: "academic",
        text: `If your ${name} were ${r.minimum} (now ${value}), “${r.label}” ${verdict[after.state]}.`,
      });
  }

  // Budget: the smallest increase that improves the financial result.
  if (before.financial !== "PASS") {
    const amounts = before.scenarios.flatMap((s) => {
      const same = s.currency === profile.currency;
      return [
        s.converted ?? (same ? s.remaining : null),
        s.lowerBoundConverted ?? (same ? s.lowerBound : null),
      ].filter((v): v is number => v !== null);
    });
    // Exactly at the amount, past the exchange-rate margin, or just under the lower-bound cut-off.
    const candidates = [
      ...new Set(
        amounts.flatMap((v) => [
          Math.ceil(v),
          Math.ceil(v / 0.95) + 1,
          Math.ceil(v / 1.05),
        ]),
      ),
    ]
      .filter((b) => b > profile.budget)
      .sort((a, b) => a - b);
    for (const budget of candidates) {
      const after = run({ ...profile, budget });
      if (better(after.financial, before.financial)) {
        out.push({
          dimension: "financial",
          text: `If your budget were ${money(budget, profile.currency)} (now ${money(profile.budget, profile.currency)}), the financial check ${verdict[after.financial]}.`,
        });
        break;
      }
    }
    const relaxed = FUNDING_STEP[profile.funding];
    if (relaxed) {
      const after = run({ ...profile, funding: relaxed });
      if (better(after.financial, before.financial))
        out.push({
          dimension: "financial",
          text: `If ${FUNDING_NAME[relaxed]} were enough instead of ${FUNDING_NAME[profile.funding]}, the financial check ${verdict[after.financial]}.`,
        });
    }
  }

  // Intake: another intake this programme lists.
  if (before.applicationState !== "PASS") {
    const tried = new Set([profile.intake]);
    for (const i of program.intakes) {
      const term = season(i.term);
      const intake = term && i.academicYear + "-" + term;
      if (!intake || tried.has(intake)) continue;
      tried.add(intake);
      const after = run({ ...profile, intake });
      if (better(after.applicationState, before.applicationState))
        out.push({
          dimension: "application",
          text: `If you applied for the ${i.academicYear} ${term} intake instead of ${profile.intake.replace("-", " ")}, the application check ${verdict[after.applicationState]}.`,
        });
    }
  }
  return out;
}
