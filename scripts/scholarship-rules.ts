import { db } from "../lib/db";
import type { Rule } from "../lib/domain";
import { squash } from "./curation";
// Scholarship rule corrections, approved by the project owner (lusparkl) on 2026-11-11.
// 1. Awards made to every admitted international student get an ON_ADMISSION rule quoting the source, so the
//    owner-confirmed GUARANTEED award can pass eligibility. KAIST also gets its application deadline: the
//    scholarship page says "Application Period Same as Admission Application", and the KAIST application
//    timeline gives the last 2027 Fall route (Regular) as January 14, 2027, 6:00 PM KST. GIST states no
//    deadline, so its eligibility stays UNKNOWN.
// 2. Nationality restrictions that list residency categories (local, non-local, international) instead of
//    countries failed every student. The categories move to an OTHER rule, which needs human review (UNKNOWN).
// Dry run by default; APPLY=1 writes. Each change is recorded on the programme's latest reviewed candidate.
const apply = process.env.APPLY === "1";
const reviewer = "claude-code (approved by project owner lusparkl, 2026-11-11)";
const KAIST_TIMELINE =
  "https://admission.kaist.ac.kr/intl-undergraduate/application/ApplicationGuide/ApplicationTimeline";
const onAdmission: Record<
  string,
  { label: string; excerpt: string; deadline?: string; deadlineQuote?: string }
> = {
  "KAIST Scholarship (international undergraduate admission)": {
    label: "Awarded on admission through International Student Admission",
    excerpt:
      "Upon being selected for admission, you will automatically be entitled to the KAIST Scholarship.",
    deadline: "2027-01-14T09:00:00.000Z",
    deadlineQuote: "Application Period Same as Admission Application",
  },
  "GIST tuition waiver (international students)": {
    label: "Granted to all admitted international students",
    excerpt: "Granted to all international students without any conditions",
  },
};
const CATEGORY = /^(non[-_ ]?)?local$|^international$/i;
const rule = (type: Rule["type"], label: string, allowed: string[]) => ({
  type,
  label,
  minimum: null,
  scale: null,
  allowed,
  mandatory: true,
  appliesToNationalities: [],
  appliesToQualifications: [],
});
const rows = await db.scholarship.findMany({
  include: { eligibility: true, evidence: { include: { document: true } } },
});
type Change = {
  row: (typeof rows)[number];
  action: string;
  data: {
    qualificationConditions: object[];
    nationalityRestrictions?: string[];
    applicationDeadline?: Date;
  };
  revised: object;
};
const changes: Change[] = [];
for (const row of rows) {
  const conditions = (row.qualificationConditions ?? []) as {
    type: string;
    label: string;
  }[];
  const award = onAdmission[row.name];
  if (award && !conditions.some((c) => c.type === "ON_ADMISSION")) {
    const page = squash(row.evidence.document.text);
    for (const quote of [award.excerpt, award.deadlineQuote])
      if (quote && !page.includes(squash(quote)))
        throw new Error(`Not verbatim on ${row.evidence.url}: ${quote}`);
    changes.push({
      row,
      action: "SCHOLARSHIP_ON_ADMISSION",
      data: {
        qualificationConditions: [
          ...conditions,
          { ...rule("ON_ADMISSION", award.label, []), excerpt: award.excerpt },
        ],
        ...(award.deadline && !row.applicationDeadline
          ? { applicationDeadline: new Date(award.deadline) }
          : {}),
      },
      revised: {
        rule: award.label,
        excerpt: award.excerpt,
        ...(award.deadline
          ? {
              applicationDeadline: award.deadline,
              deadlineQuote: award.deadlineQuote,
              deadlineSource: KAIST_TIMELINE,
            }
          : {}),
      },
    });
  }
  const categories = row.nationalityRestrictions;
  if (categories.length && categories.every((n) => CATEGORY.test(n)))
    changes.push({
      row,
      action: "SCHOLARSHIP_NATIONALITY_CATEGORIES",
      data: {
        nationalityRestrictions: [],
        qualificationConditions: [
          ...conditions,
          rule(
            "OTHER",
            "Scholarship residency eligibility: " + categories.join(", "),
            categories,
          ),
        ],
      },
      revised: { nationalityRestrictions: [], otherRule: categories },
    });
}
const count = (a: string) => changes.filter((c) => c.action === a).length;
console.log(
  `Scholarships: ${rows.length}. On admission: ${count("SCHOLARSHIP_ON_ADMISSION")}, residency categories: ${count("SCHOLARSHIP_NATIONALITY_CATEGORIES")}.`,
);
for (const c of changes)
  console.log(`   ${c.action} ${c.row.id} ${c.row.name}`);
if (!apply) {
  console.log("Dry run. Set APPLY=1 to write.");
  process.exit(0);
}
let unrecorded = 0;
for (const { row, action, data, revised } of changes) {
  await db.$transaction(async (tx) => {
    await tx.scholarship.update({ where: { id: row.id }, data });
    const programId = row.eligibility.find((e) => e.programId)?.programId;
    const candidate = programId
      ? await tx.extractionCandidate.findFirst({
          where: { programId, reviewedAt: { not: null } },
          orderBy: { reviewedAt: "desc" },
        })
      : null;
    if (!candidate) {
      unrecorded++;
      return;
    }
    await tx.reviewRecord.create({
      data: {
        candidateId: candidate.id,
        action,
        previousValue: {
          scholarshipId: row.id,
          qualificationConditions: row.qualificationConditions,
          nationalityRestrictions: row.nationalityRestrictions,
          applicationDeadline: row.applicationDeadline,
        },
        revisedValue: { scholarshipId: row.id, ...revised },
        administratorIdentity: reviewer,
      },
    });
  });
}
console.log(
  `Applied ${changes.length} changes; ${unrecorded} without a candidate to record on.`,
);
process.exit(0);
