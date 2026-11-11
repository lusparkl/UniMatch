import { db } from "../lib/db";
import { squash } from "./curation";
// POSTECH tuition decision (re-read of the cost-of-attendance page on 2026-11-11, delegated by the project owner).
// - The "Estimated Essential Expenses (as of 2026)" table gives Tuition Fees 2,790,000 per semester (5,580,000 a
//   year), but its own note says "First semester tuition fee of 2026 : KRW 2,924,000 (automatically waived)".
//   Two tuition figures stand for the same semester, so the tuition part is CONFLICTING.
// - The table's tuition is gross: the waiver is subtracted separately in "POSTECH Scholarship" (B), so the stored
//   tuition does not double-count the POSTECH Tuition Scholarship.
// - Housing, phone, food (7,235,000) and NHI (951,840) carry no conflicting figure and stay SOURCE_BACKED.
// Dry run by default; APPLY=1 writes. Each change is recorded on the programme's latest candidate.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (re-read of the POSTECH cost-of-attendance page on 2026-11-11, delegated by project owner)";
const COST_PAGE = /adm-iu\.postech\.ac\.kr\/.*4a69b7aee6a156d3c2ddb7413544ab2c/;
const TABLE = "Tuition Fees 2,790,000 2,790,000 5,580,000";
const NOTE =
  "First semester tuition fee of 2026 : KRW 2,924,000 (automatically waived)";
const rows = await db.costEstimate.findMany({
  where: {
    universityId: "postech",
    tuitionAmount: 5580000,
    verificationStatus: { not: "CONFLICTING" },
  },
  include: { evidence: true },
});
const changes = rows.filter((row) => {
  const excerpt = squash(row.evidence.excerpt);
  if (!COST_PAGE.test(row.evidence.url)) return false;
  if (!excerpt.includes(TABLE) || !excerpt.includes(NOTE))
    throw new Error("Quotation lacks the conflicting figures: " + row.id);
  return true;
});
console.log(
  `POSTECH cost rows with tuition 5,580,000: ${rows.length}. Split tuition to CONFLICTING: ${changes.length}.`,
);
if (!apply) {
  console.log("Dry run. Set APPLY=1 to write.");
  process.exit(0);
}
let unrecorded = 0;
for (const row of changes) {
  await db.$transaction(async (tx) => {
    // Living and NHI keep their status; the tuition figure moves to its own CONFLICTING row with the same quotation.
    await tx.costEstimate.update({
      where: { id: row.id },
      data: { tuitionAmount: null },
    });
    await tx.costEstimate.create({
      data: {
        universityId: row.universityId,
        programId: row.programId,
        tuitionAmount: row.tuitionAmount,
        currency: row.currency,
        period: row.period,
        estimateType: row.estimateType,
        verificationStatus: "CONFLICTING",
        sourceEvidenceId: row.sourceEvidenceId,
      },
    });
    const candidate = row.programId
      ? await tx.extractionCandidate.findFirst({
          where: { programId: row.programId },
          orderBy: { createdAt: "desc" },
        })
      : null;
    if (!candidate) {
      unrecorded++;
      return;
    }
    await tx.reviewRecord.create({
      data: {
        candidateId: candidate.id,
        action: "POSTECH_COST_SPLIT_CONFLICTING_TUITION",
        previousValue: {
          cost: { ...row, evidence: undefined, evidenceUrl: row.evidence.url },
        },
        revisedValue: {
          status: "CONFLICTING",
          tuitionAmount: row.tuitionAmount,
          note: `Table states "${TABLE}"; note states "${NOTE}".`,
        },
        administratorIdentity: reviewer,
      },
    });
  });
}
console.log(
  `Applied ${changes.length} changes; ${unrecorded} without a candidate to record on.`,
);
process.exit(0);
