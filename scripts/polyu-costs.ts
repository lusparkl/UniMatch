import { db } from "../lib/db";
// W2f decision for PolyU costs (re-read of the official pages on 2026-11-10, delegated by the project owner).
// - The other-fees page itemises tuition HK$240,000 + accommodation 18,515 + meals 53,040 + personal 18,717
//   (= HK$330,272) but states "Spending per academic year HK$290,272 (USD: 37,214)". Both figures stand on the
//   live page, so every living figure quoted from it is CONFLICTING. Tuition HK$240,000 stays: the tuition-fees
//   page states it for 2027/28 and its USD figure agrees.
// - The HK$20,000 "initial fee" was stored as an additional cost. The tuition-fees page says it "will be
//   converted to form part of the first semester tuition fee upon admission", so it is not an extra cost and
//   those rows are removed.
// Dry run by default; APPLY=1 writes. Each change is recorded on the programme's latest candidate.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (re-read of PolyU fee pages on 2026-11-10, delegated by project owner)";
const OTHER_FEES = /international-other-qualifications-other-fees-and/;
const TUITION_FEES = /international-other-qualifications-tuition-fees/;
const rows = await db.costEstimate.findMany({
  where: { university: { name: { contains: "Polytechnic" } } },
  include: { evidence: true },
});
const changes: {
  row: (typeof rows)[number];
  action: string;
  revised: object;
}[] = [];
for (const row of rows) {
  if (
    OTHER_FEES.test(row.evidence.url) &&
    row.livingCostAmount !== null &&
    row.verificationStatus !== "CONFLICTING"
  )
    changes.push({
      row,
      action:
        row.tuitionAmount !== null
          ? "SPLIT_CONFLICTING_LIVING"
          : "MARK_CONFLICTING",
      revised: {
        status: "CONFLICTING",
        livingCostAmount: row.livingCostAmount,
      },
    });
  else if (
    TUITION_FEES.test(row.evidence.url) &&
    row.additionalCosts === 20000 &&
    row.tuitionAmount === null &&
    row.livingCostAmount === null
  )
    changes.push({ row, action: "REMOVE_MISREAD", revised: { removed: true } });
}
const count = (a: string) => changes.filter((c) => c.action === a).length;
console.log(
  `PolyU cost rows: ${rows.length}. Split: ${count("SPLIT_CONFLICTING_LIVING")}, conflicting: ${count("MARK_CONFLICTING")}, removed: ${count("REMOVE_MISREAD")}.`,
);
if (!apply) {
  console.log("Dry run. Set APPLY=1 to write.");
  process.exit(0);
}
let unrecorded = 0;
for (const { row, action, revised } of changes) {
  await db.$transaction(async (tx) => {
    if (action === "SPLIT_CONFLICTING_LIVING") {
      // Tuition keeps its status; the living figure moves to its own CONFLICTING row with the same quotation.
      await tx.costEstimate.update({
        where: { id: row.id },
        data: { livingCostAmount: null },
      });
      await tx.costEstimate.create({
        data: {
          universityId: row.universityId,
          programId: row.programId,
          livingCostAmount: row.livingCostAmount,
          currency: row.currency,
          period: row.period,
          estimateType: row.estimateType,
          verificationStatus: "CONFLICTING",
          sourceEvidenceId: row.sourceEvidenceId,
        },
      });
    } else if (action === "MARK_CONFLICTING")
      await tx.costEstimate.update({
        where: { id: row.id },
        data: { verificationStatus: "CONFLICTING" },
      });
    else await tx.costEstimate.delete({ where: { id: row.id } });
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
        action: "POLYU_COST_" + action,
        previousValue: {
          cost: { ...row, evidence: undefined, evidenceUrl: row.evidence.url },
        },
        revisedValue: revised,
        administratorIdentity: reviewer,
      },
    });
  });
}
console.log(
  `Applied ${changes.length} changes; ${unrecorded} without a candidate to record on.`,
);
process.exit(0);
