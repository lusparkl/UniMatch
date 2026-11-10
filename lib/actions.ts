import type { Profile, Program } from "./domain";
import type { Check } from "./matching";

// What a student can do about a result that is not PASS: add a missing input, or check the official page.
export type Action = { label: string; href: string; external: boolean };

/** Profile fields behind scored checks, with the name students know them by. */
export const SCORE_FIELDS: Record<
  string,
  { field: keyof Profile; name: string }
> = {
  IELTS: { field: "ielts", name: "IELTS" },
  TOEFL: { field: "toefl", name: "TOEFL" },
  DUOLINGO: { field: "duolingo", name: "Duolingo English Test" },
  PTE: { field: "pte", name: "PTE Academic" },
  SAT: { field: "sat", name: "SAT" },
  ACT: { field: "act", name: "ACT" },
  GRADE: { field: "grade", name: "grade" },
};
const profileLink = (field: keyof Profile, label: string): Action => ({
  label,
  href: "/profile#" + field,
  external: false,
});

export function actionFor(
  check: Check,
  program: Program,
  profile: Profile,
): Action | null {
  if (check.state !== "UNKNOWN") return null;
  if (check.reason === "Qualification is needed to determine applicability.")
    return profileLink("qualification", "Add your qualification");
  if (check.kind === "ENGLISH" && check.reason.startsWith("Add one result"))
    return profileLink("ielts", "Add an English test score");
  const score = check.kind ? SCORE_FIELDS[check.kind] : undefined;
  if (score && profile[score.field] === null)
    return profileLink(score.field, "Add your " + score.name + " score");
  if (check.kind === "GRADE" && !profile.gradingScale)
    return profileLink("gradingScale", "Add your grading scale");
  // Everything else is resolved on the source: the rule's own page, else the programme page.
  const href = check.url || program.officialUrl;
  return href
    ? { label: "Check the official page", href, external: true }
    : null;
}

/** The actions for every UNKNOWN check of a match, without duplicates, in check order. */
export function actionsFor(
  checks: Check[],
  program: Program,
  profile: Profile,
): Action[] {
  const seen = new Set<string>();
  return checks.flatMap((c) => {
    const a = actionFor(c, program, profile);
    if (!a || seen.has(a.label + a.href)) return [];
    seen.add(a.label + a.href);
    return [a];
  });
}
