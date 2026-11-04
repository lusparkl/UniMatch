import type { Verification } from "./domain";

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
