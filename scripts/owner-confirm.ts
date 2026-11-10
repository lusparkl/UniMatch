import { db } from "../lib/db";
// Plan 3.7: GUARANTEED scholarships count in matching only when ADMIN_VERIFIED, which Claude Code never sets.
// This script promotes only the scholarships listed in docs/OWNER_CONFIRM.md (by name, every programme's copy),
// and only after the owner has answered the question there and runs it with OWNER_CONFIRMED=1 and
// OWNER_NAME="<name>". Each promotion is recorded as a ReviewRecord naming the owner. A row whose category is no
// longer GUARANTEED, or whose status is no longer SOURCE_BACKED, is left alone. Without OWNER_CONFIRMED=1 it only lists.
const listed = [
  "KAIST Scholarship (international undergraduate admission)",
  "POSTECH Tuition Scholarship (tuition waiver)",
  "POSTECH Living Allowance (International Admissions, KRW 500,000 per month)",
  "GIST tuition waiver (international students)",
];
const only = process.env.ONLY?.split("|");
const names = only ? listed.filter((n) => only.includes(n)) : listed;
const confirmed = process.env.OWNER_CONFIRMED === "1";
const owner = process.env.OWNER_NAME?.trim();
if (confirmed && !owner)
  throw new Error("Set OWNER_NAME to the confirming owner's name");
const rows = await db.scholarship.findMany({
  where: { name: { in: names } },
  include: { eligibility: true },
});
for (const s of rows) {
  const ready =
    s.fundingCategory === "GUARANTEED" &&
    s.verificationStatus === "SOURCE_BACKED";
  console.log(
    `   ${s.id} ${s.name} [${s.fundingCategory}, ${s.verificationStatus}]${ready ? "" : " (left alone)"}`,
  );
  if (!confirmed || !ready) continue;
  const programId = s.eligibility.find((e) => e.programId)?.programId;
  const candidate = programId
    ? await db.extractionCandidate.findFirst({
        where: { programId, status: "SOURCE_BACKED" },
        orderBy: { reviewedAt: "desc" },
      })
    : null;
  if (!candidate) {
    console.log("     no reviewed candidate to record on; skipped");
    continue;
  }
  await db.$transaction([
    db.scholarship.update({
      where: { id: s.id },
      data: { verificationStatus: "ADMIN_VERIFIED" },
    }),
    db.sourceEvidence.update({
      where: { id: s.sourceEvidenceId },
      data: { verificationStatus: "ADMIN_VERIFIED", verifiedAt: new Date() },
    }),
    db.reviewRecord.create({
      data: {
        candidateId: candidate.id,
        action: "OWNER_CONFIRMED_GUARANTEED",
        previousValue: {
          scholarshipId: s.id,
          verificationStatus: s.verificationStatus,
        },
        revisedValue: {
          scholarshipId: s.id,
          verificationStatus: "ADMIN_VERIFIED",
          fundingCategory: "GUARANTEED",
        },
        administratorIdentity: owner!,
      },
    }),
  ]);
  console.log("     promoted to ADMIN_VERIFIED");
}
if (!confirmed)
  console.log(
    'Listing only. The owner runs it with OWNER_CONFIRMED=1 OWNER_NAME="<name>".',
  );
process.exit(0);
