import { db } from "../lib/db";
// docs/OWNER_CONFIRM.md at commit 9a198b0 item 5: 42 ADMIN_VERIFIED HKUST accommodation-only rows store HKD 21,000 per SEMESTER, but
// the source states "~HKD 21,000 – HKD 51,000 ... per residential year". The cost schema cannot store a range, so
// the owner confirmed deleting exactly those rows. Tuition rows and HKD 65,000 personal-expense rows (including the
// two combined annual rows) are untouched. Lists only unless OWNER_CONFIRMED=1 and OWNER_NAME="<name>" are set;
// each deletion is recorded as a ReviewRecord naming the owner.
const confirmed = process.env.OWNER_CONFIRMED === "1";
const owner = process.env.OWNER_NAME?.trim();
if (confirmed && !owner)
  throw new Error("Set OWNER_NAME to the confirming owner's name");
const QUOTE =
  "HKD 21,000 – HKD 51,000 (~USD 2,700 – USD 6,500) per residential year";
const rows = await db.costEstimate.findMany({
  where: {
    universityId: "hkust",
    verificationStatus: "ADMIN_VERIFIED",
    tuitionAmount: null,
    livingCostAmount: 21000,
    additionalCosts: null,
    period: "SEMESTER",
    currency: "HKD",
  },
  include: { evidence: true },
});
const targets = rows.filter((row) => row.evidence.excerpt.includes(QUOTE));
console.log(
  `HKUST accommodation-only rows: ${rows.length}; citing the residential-year range: ${targets.length}.`,
);
if (targets.length !== 42)
  throw new Error("Expected exactly 42 rows, as listed in OWNER_CONFIRM.md");
if (!confirmed) {
  console.log(
    'Listing only. The owner runs it with OWNER_CONFIRMED=1 OWNER_NAME="<name>".',
  );
  process.exit(0);
}
let unrecorded = 0;
for (const row of targets) {
  await db.$transaction(async (tx) => {
    await tx.costEstimate.delete({ where: { id: row.id } });
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
        action: "OWNER_CONFIRMED_DELETE_MISPARSED_COST",
        previousValue: {
          cost: { ...row, evidence: undefined, evidenceUrl: row.evidence.url },
        },
        revisedValue: {
          removed: true,
          reason: `Source states "${QUOTE}"; the row stored HKD 21,000 per SEMESTER.`,
        },
        administratorIdentity: owner!,
      },
    });
  });
}
console.log(
  `Deleted ${targets.length} rows; ${unrecorded} without a candidate to record on.`,
);
process.exit(0);
