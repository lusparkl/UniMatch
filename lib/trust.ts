import type { Program, Verification } from "./domain";
import { annualCost } from "./matching";

// Three trust tiers shown to students, computed from the stored verification status (no schema change).
// Only a person sets ADMIN_VERIFIED; automated review writes SOURCE_BACKED; everything else needs checking.
export type TrustTier = 1 | 2 | 3;
export const trustTier = (status: Verification): TrustTier =>
  status === "ADMIN_VERIFIED" ? 1 : status === "SOURCE_BACKED" ? 2 : 3;
export const tierLabel: Record<TrustTier, string> = {
  1: "Human-reviewed",
  2: "Auto-verified from official source",
  3: "Needs verification",
};
export const REVIEW_DISCLOSURE =
  "Review for this hackathon build was automated by machine checks and sampled by hand for accuracy.";

/**
 * Fully checked: the complete requirement set is reviewed and a complete trusted annual cost exists for the
 * intake year. The home page count and the results filter use this one predicate.
 */
export const fullyChecked = (program: Program, intakeYear: string) =>
  program.requirementsComplete &&
  annualCost(program, intakeYear).total !== null;
/** The weakest trust tier among a programme's requirements and costs; nothing stored means tier 3. */
export const programTier = (program: Program): TrustTier => {
  const statuses = [...program.requirements, ...program.costs].map(
    (r) => r.status,
  );
  return statuses.length
    ? (Math.max(...statuses.map(trustTier)) as TrustTier)
    : 3;
};
