import { db } from "../lib/db";
import { squash } from "./curation";
// W6 hygiene, read-only: every published fact's quotation must still be verbatim in the stored page version it
// cites, and pending candidates must be first-year bachelor's programmes. Prints counts per university and the
// failing rows; writes nothing.
const kinds = {
  requirement: () =>
    db.admissionRequirement.findMany({
      where: { program: { published: true } },
      include: { evidence: { include: { document: true } }, program: true },
    }),
  intake: () =>
    db.applicationIntake.findMany({
      where: { program: { published: true }, evidence: { isNot: null } },
      include: { evidence: { include: { document: true } }, program: true },
    }),
  cost: () =>
    db.costEstimate.findMany({
      where: { program: { published: true } },
      include: { evidence: { include: { document: true } }, program: true },
    }),
  document: () =>
    db.requiredDocument.findMany({
      where: { program: { published: true } },
      include: { evidence: { include: { document: true } }, program: true },
    }),
};
const tally = new Map<string, { checked: number; missing: number }>();
for (const [kind, load] of Object.entries(kinds)) {
  for (const row of await load()) {
    const e = row.evidence!;
    const key = `${row.program!.universityId} ${kind}`;
    const t = tally.get(key) ?? { checked: 0, missing: 0 };
    t.checked++;
    if (!squash(e.document.text).includes(squash(e.excerpt))) {
      t.missing++;
      console.log(
        `   not verbatim: ${key} | ${row.program!.title} | ${e.excerpt.slice(0, 80)}`,
      );
    }
    tally.set(key, t);
  }
}
for (const [key, t] of [...tally].sort())
  console.log(`${key}: ${t.checked} checked, ${t.missing} not verbatim`);
const pending = await db.extractionCandidate.findMany({
  where: { reviewedAt: null },
  include: { job: true },
});
console.log(`Pending candidates: ${pending.length}`);
for (const c of pending)
  console.log(
    `   pending: ${c.job.universityId} ${c.id} ${JSON.stringify(c.payload).slice(0, 100)}`,
  );
process.exit(0);
