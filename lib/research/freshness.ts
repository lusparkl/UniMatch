import type { Verification } from "../domain";
import { positive } from "../config";
export function effectiveStatus(
  status: Verification,
  lastChecked: Date,
  kind: "deadline" | "scholarship" | "metadata" | "admissions" = "admissions",
  now = new Date(),
): Verification {
  if (!["ADMIN_VERIFIED", "SOURCE_BACKED"].includes(status)) return status;
  const days =
    kind === "deadline"
      ? positive("FRESHNESS_DEADLINE_DAYS", 7)
      : kind === "metadata"
        ? positive("FRESHNESS_METADATA_DAYS", 90)
        : positive("FRESHNESS_SCHOLARSHIP_DAYS", 30);
  return now.getTime() - lastChecked.getTime() > days * 86400000
    ? "OUTDATED"
    : status;
}
