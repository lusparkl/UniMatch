import { createHash } from "node:crypto";
import { db } from "../lib/db";
import { extractionSchema, type Extraction } from "../lib/research/extraction";
import { reviewCandidate } from "../lib/research/review";
// Requirement check of HKU and HKBU against their official pages (2026-11-10, delegated by the project owner).
// - HKU: the "Admissions Standards" selector on the international-qualifications page loads its data from
//   /api/international_qualification/admission_standard/<country>. IB Diploma and GCE A-level standards are
//   the same for every country (checked for Ukraine, India, United Kingdom, Singapore). They are stored as a
//   new version of the page, as the selector renders them, and quoted per programme.
// - HKBU: the accordions on the international-qualifications page are in the stored page text already. The IB
//   and A-level entrance routes and the English alternatives are encoded; the SAT reading-and-writing rule,
//   stored as a requirement for everyone, becomes one of the English alternatives.
// "Lower boundary for admissions" is not stated as a minimum, so it stays an OTHER rule (UNKNOWN).
// Rules are added as SOURCE_BACKED; human-reviewed rows are kept. No requirementsComplete is set: neither
// university gets an accepted-qualification list for every applicant. Dry run by default; APPLY=1 writes.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (check of HKU and HKBU requirement pages on 2026-11-10, delegated by project owner)";
const squash = (value: string) => value.replace(/[\s  -​ 　]+/g, " ").trim();
const strip = (html: string) =>
  squash(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&"),
  );
type Requirement = Extraction["requirements"][number];
const rule = (
  type: Requirement["type"],
  label: string,
  cited: { excerpt: string; sourceUrl: string },
  extra: Partial<Requirement> = {},
): Requirement => ({
  type,
  label,
  minimum: null,
  scale: null,
  allowed: [],
  mandatory: true,
  appliesToNationalities: [],
  appliesToQualifications: [],
  ...cited,
  ...extra,
});
const english = "English proof (any one accepted test): ";
function quoter(url: string, text: string) {
  const page = squash(text);
  return (start: string, end = start) => {
    const endAt = page.indexOf(end);
    if (endAt < 0) throw new Error(`"${end}" not found in ${url}`);
    const startAt = page.lastIndexOf(start, endAt);
    if (startAt < 0)
      throw new Error(`"${start}" not found before "${end}" in ${url}`);
    const excerpt = page.slice(startAt, endAt + end.length);
    if (excerpt.length > 1200)
      throw new Error(`Excerpt over 1200 characters in ${url}`);
    return { excerpt, sourceUrl: url };
  };
}
const latest = (url: string) =>
  db.sourceDocument.findFirstOrThrow({
    where: { url },
    orderBy: { retrievedAt: "desc" },
  });

// --- HKU ---
const hkuPage =
  "https://www.admissions.hku.hk/apply/international-qualifications";
type Standard = {
  programme_name: string;
  programme_code: string;
  lower_boundary_for_admissions: string;
  subject_requirements: string;
};
const standards = (
  (await (
    await fetch(
      "https://www.admissions.hku.hk/api/international_qualification/admission_standard/Ukraine",
      { headers: { "user-agent": "UniMatch reviewer" } },
    )
  ).json()) as {
    data: {
      Ukraine: Record<string, { programmes: Record<string, Standard> }>;
    };
  }
).data.Ukraine;
// Profile qualification names the API's qualifications apply to.
const hkuQualifications = {
  "IB Diploma": "IB Diploma",
  "GCE A-level": "GCE A-Level",
};
const line = (q: string, s: Standard) =>
  `${squash(s.programme_name)} (${s.programme_code}) | ${q} | Lower Boundary for Admissions: ${strip(s.lower_boundary_for_admissions)} | Subject Requirements: ${strip(s.subject_requirements)}`;
const section = Object.keys(hkuQualifications)
  .flatMap((q) => Object.values(standards[q].programmes).map((s) => line(q, s)))
  .join("\n");
const hkuBefore = await latest(hkuPage);
const marker =
  "\n\nAdmissions Standards (as the page's selector renders them for each qualification and programme)\n";
// A rerun replaces the section added by an earlier run instead of appending it twice.
const hkuText = hkuBefore.text.split(marker)[0] + marker + section;
const hkuHash = createHash("sha256").update(hkuText).digest("hex");
const hkuQuote = quoter(hkuPage, hkuText);
const norm = (s: string) => squash(s).toLowerCase();
function hkuRules(title: string): Requirement[] | null {
  const rules: Requirement[] = [];
  for (const [q, profileName] of Object.entries(hkuQualifications)) {
    const s = Object.values(standards[q].programmes).find(
      (p) => norm(p.programme_name) === norm(title),
    );
    if (!s) return null;
    const head = `${squash(s.programme_name)} (${s.programme_code}) | ${q} |`;
    const lower = strip(s.lower_boundary_for_admissions);
    const subjects = strip(s.subject_requirements);
    const scope = { appliesToQualifications: [profileName] };
    rules.push(
      rule(
        "OTHER",
        `${q} lower boundary for admissions: ${lower}`,
        hkuQuote(`${head} Lower Boundary for Admissions: ${lower}`),
        scope,
      ),
    );
    if (!/^no specific subject requirements?/i.test(subjects))
      rules.push(
        rule(
          "OTHER",
          `${q} subject requirements: ${subjects}`.slice(0, 300),
          hkuQuote(
            `${head} Lower Boundary for Admissions: ${lower} | Subject Requirements: ${subjects}`,
          ),
          scope,
        ),
      );
  }
  return rules;
}

// --- HKBU ---
const hkbuPage =
  "https://admissions.hkbu.edu.hk/admissions/international-qualifications.html";
const hkbuQuote = quoter(hkbuPage, (await latest(hkbuPage)).text);
const hkbuRules: Requirement[] = [
  rule(
    "QUALIFICATION",
    "General entrance requirement: IB Diploma",
    hkbuQuote("International Baccalaureate (IB) IB Diploma*"),
    { allowed: ["IB Diploma"], appliesToQualifications: ["IB Diploma"] },
  ),
  rule(
    "OTHER",
    "General entrance requirement (GCE A-level / International A-level): Grade E or above in three AL/IAL subjects, or in two AL/IAL subjects plus two AS-level subjects, not counting Chinese and English Language",
    hkbuQuote(
      "GCE Advanced Level (AL)/ International Advanced Level (IAL):",
      "cannot be counted at both the AL and ASL.)",
    ),
    { appliesToQualifications: ["GCE A-Level", "International A-Level"] },
  ),
  rule(
    "IELTS",
    english + "IELTS Academic overall band 6.0",
    hkbuQuote("IELTS Academic Overall Band: 6.0"),
    { minimum: 6, scale: "IELTS Academic overall band" },
  ),
  rule(
    "OTHER",
    english + "TOEFL iBT / iBT Home Edition score 79",
    hkbuQuote("TOEFL Internet-based test (iBT) / iBT Home Edition - Score: 79"),
  ),
  rule(
    "OTHER",
    english + "SAT Evidence-Based Reading and Writing 590 or above (new SAT)",
    hkbuQuote(
      "SATMinimum score of 590 in Evidence-Based Reading and Writing in new SAT",
    ),
  ),
  rule(
    "OTHER",
    english +
      "IB English: Grade 4 in English A (HL/SL) or English B (HL), or Grade 5 in English B (SL)",
    hkbuQuote(
      "IB One of the following: Grade 4 in IB English A",
      "Grade 4 in IB English Literature and Performance (Standard Level)",
    ),
  ),
  rule(
    "OTHER",
    english + "Grade E in English at GCE AS or A-level",
    hkbuQuote("GCE AS or A-LevelGrade E in English"),
  ),
];
// Superseded by the English alternative above: stored as a requirement for every applicant.
const hkbuSuperseded = "SAT evidence-based reading and writing minimum";

const plans: { id: string; rules: Requirement[] }[] = [];
const skipped: string[] = [];
for (const p of await db.degreeProgram.findMany({
  where: { universityId: { in: ["hku", "hkbu"] }, published: true },
  orderBy: [{ universityId: "asc" }, { title: "asc" }],
})) {
  if (p.universityId === "hkbu") {
    plans.push({ id: p.id, rules: hkbuRules });
    continue;
  }
  const rules = hkuRules(p.title);
  if (rules) plans.push({ id: p.id, rules });
  else skipped.push(p.title);
}
console.log(
  `HKU standards: ${section.split("\n").length} lines. Programmes to update: ${plans.length}. Not on the HKU standards list: ${skipped.length}.`,
);
for (const s of skipped) console.log("   skipped:", s);
if (!apply) {
  for (const plan of plans.slice(0, 1).concat(plans.slice(-1)))
    for (const r of plan.rules) console.log("  ", r.label, "|", r.excerpt);
  console.log("Dry run. Set APPLY=1 to write.");
  process.exit(0);
}
if (hkuHash !== hkuBefore.contentHash)
  await db.sourceDocument.create({
    data: {
      universityId: hkuBefore.universityId,
      url: hkuPage,
      title: hkuBefore.title,
      text: hkuText,
      contentHash: hkuHash,
      documentType: hkuBefore.documentType,
      previousVersionId: hkuBefore.id,
    },
  });
for (const plan of plans) {
  const program = await db.degreeProgram.findUniqueOrThrow({
    where: { id: plan.id },
  });
  const base = (
    await db.extractionCandidate.findMany({
      where: {
        programId: plan.id,
        status: { in: ["ADMIN_VERIFIED", "SOURCE_BACKED"] },
      },
      orderBy: { reviewedAt: "desc" },
    })
  )
    .map((candidate) => ({
      candidate,
      parsed: extractionSchema.safeParse(candidate.payload),
    }))
    .find(
      (entry) => entry.parsed.success && entry.parsed.data.program,
    )?.candidate;
  if (!base) throw new Error("No approved candidate names " + program.title);
  const payload = extractionSchema.parse({
    ...extractionSchema.parse(base.payload),
    academicYear: "2027",
    requirements: plan.rules,
    intakes: [],
    costs: [],
    documents: [],
    scholarships: [],
    ambiguities: [],
  });
  const job = await db.researchJob.create({
    data: {
      universityId: program.universityId,
      targets: ["Reviewer curation: HKU/HKBU requirement check 2026-11-10"],
      stage: "Review needed",
      status: "REVIEW_NEEDED",
    },
  });
  const candidate = await db.extractionCandidate.create({
    data: {
      jobId: job.id,
      documentId: base.documentId,
      programId: plan.id,
      payload,
      issues: [],
    },
  });
  await reviewCandidate(candidate.id, "APPROVE", reviewer, payload, false, {
    status: "SOURCE_BACKED",
  });
  await db.researchJob.update({
    where: { id: job.id },
    data: { stage: "Reviewed", status: "COMPLETED", completedAt: new Date() },
  });
  if (program.universityId === "hkbu") {
    const old = await db.admissionRequirement.findMany({
      where: {
        programId: plan.id,
        conditions: { path: ["label"], equals: hkbuSuperseded },
      },
    });
    if (old.length) {
      await db.admissionRequirement.deleteMany({
        where: { id: { in: old.map((r) => r.id) } },
      });
      await db.reviewRecord.create({
        data: {
          candidateId: candidate.id,
          action: "SUPERSEDED_REQUIREMENT",
          previousValue: JSON.parse(JSON.stringify(old)),
          revisedValue: {
            label:
              english +
              "SAT Evidence-Based Reading and Writing 590 or above (new SAT)",
          },
          administratorIdentity: reviewer,
        },
      });
    }
  }
  console.log("   approved:", program.universityId, program.title);
}
process.exit(0);
