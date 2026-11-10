import { db } from "../lib/db";
import { extractionSchema, type Extraction } from "../lib/research/extraction";
import { reviewCandidate } from "../lib/research/review";
import { curationJob, fetchApproved, latestDocument, quoter } from "./curation";
// W4 2.3 / W2d: CUHK requirement sets rebuilt from two 2027-entry official sources (2026-11-10, delegated by the
// project owner), in the pattern of the HKUST sets (scripts/curate-hkust-requirements.ts):
// - the non-local "Requirements" page: general requirement (IB Diploma with 30 points out of 45; 3 AL passes or
//   2 AL + 2 AS passes, with programme-specific subjects for A-level) and the English tests;
// - the CUHK IB guide PDF "For International Baccalaureate (IB) Candidates (2027 Entry)", now an approved source:
//   IB Chinese grade 4 (the Dean may exempt), an OTHER rule, so IB students stay UNKNOWN on it. The guide states
//   that programme subject preferences "are NOT subject requirements"; none is encoded.
// The allow-list names IB and A-level; other qualifications give "equivalency not verified". The A-level route
// is an OTHER rule (programme subjects are not listed). Model-extracted rows are replaced and kept in a
// ReviewRecord. Dual-degree programmes are left as they are. SOURCE_BACKED; requirementsComplete is left to `npm run review:auto`. APPLY=1 writes.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (CUHK requirements page and IB guide checked on 2026-11-10, delegated by project owner)";
type Requirement = Extraction["requirements"][number];
type Cited = { excerpt: string; sourceUrl: string };
const rule = (
  type: Requirement["type"],
  label: string,
  cited: Cited,
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
const reqUrl =
  "https://admission.cuhk.edu.hk/application/overseas-other-qualifications-non-local-international-team/requirements/";
const ibUrl = "https://www.cuhk.edu.hk/adm/intl/adm_guide/IB.pdf";
const alevel = ["GCE A-Level", "International A-Level"];
if (apply)
  await db.approvedSource.upsert({
    where: { universityId_startUrl: { universityId: "cuhk", startUrl: ibUrl } },
    create: {
      universityId: "cuhk",
      startUrl: ibUrl,
      hostname: new URL(ibUrl).hostname,
      purpose: "registry",
      allowSubdomains: false,
    },
    update: {},
  });
const reqPage = await latestDocument("cuhk", reqUrl);
if (!reqPage) throw new Error("Not stored: " + reqUrl);
const r = quoter(reqUrl, reqPage.text);
const ibPage = apply ? await fetchApproved("cuhk", ibUrl) : null;
// The dry run does not fetch the guide; its quotes are placeholders there.
const ib = (start: string, end?: string) =>
  ibPage
    ? quoter(ibUrl, ibPage.text)(start, end)
    : { excerpt: "(dry run: IB guide not fetched)", sourceUrl: ibUrl };
const requirements: Requirement[] = [
  rule(
    "QUALIFICATION",
    "General requirement: IB Diploma, or GCE / International A-level (the other accepted qualifications on the official page are not yet encoded)",
    r(
      "(a) GCE AL / International AL / IB / Other High School Qualifications",
      "International Baccalaureate (IB) Diploma",
    ),
    { allowed: ["IB Diploma", ...alevel] },
  ),
  rule(
    "GRADE",
    "IB Diploma with 30 points out of 45",
    r("International Baccalaureate Diploma (IB) with 30 points out of 45"),
    {
      minimum: 30,
      scale: "IB Diploma points (out of 45)",
      appliesToQualifications: ["IB Diploma"],
    },
  ),
  rule(
    "OTHER",
    "IB Chinese Language requirement: grade 4 or above in an IB Chinese Language subject (IB Diploma holders may be exempted at the discretion of the Faculty Dean)",
    ib(
      "Chinese Language Requirement: Grade 4 or above in IB Chinese Language subject",
      "Faculty Dean concerned)",
    ),
    { appliesToQualifications: ["IB Diploma"] },
  ),
  rule(
    "OTHER",
    "A-level route: 3 AL passes or 2 AL + 2 AS passes; different programmes have different subject requirements",
    r(
      "GCE AL / International AL General Minimum Requirement 3AL passes / 2AL + 2AS passes",
      "different programmes have different subject requirements",
    ),
    { appliesToQualifications: alevel },
  ),
  rule(
    "IELTS",
    english + "IELTS (Academic) overall band 6.0",
    r("IELTS (Academic) 6.0 (Overall Band Score)"),
    { minimum: 6, scale: "IELTS Academic overall band" },
  ),
  rule(
    "OTHER",
    english +
      "TOEFL iBT 80/120 (tests before 21 January 2026) or 4.5/6 (from 21 January 2026)",
    r(
      "TOEFL (iBT) 80 out of 120",
      "[For tests taken on or after 21 January 2026]",
    ),
  ),
  rule(
    "OTHER",
    english + "Grade 4 or above in an IB English Language subject",
    ib(
      "English Language Requirement: Grade 4 or above in IB English Language subject",
    ),
  ),
  rule(
    "OTHER",
    english + "Grade E in GCE AL / AS English",
    r("GCE AL / AS E IB 4"),
  ),
];
const programs = await db.degreeProgram.findMany({
  where: { universityId: "cuhk", published: true },
  include: { requirements: true },
  orderBy: { title: "asc" },
});
const job = apply
  ? await curationJob("cuhk", "CUHK requirement sets 2026-11-10")
  : null;
for (const p of programs) {
  // Dual-degree programmes may set conditions of their own (the fee page already says their tuition varies).
  if (/dual undergraduate degree|double degree/i.test(p.title)) {
    console.log("   skip (dual degree):", p.title);
    continue;
  }
  console.log(
    `   ${p.title}: ${p.requirements.length} old rules -> ${requirements.length}`,
  );
  if (!apply) continue;
  const base = (
    await db.extractionCandidate.findMany({
      where: {
        programId: p.id,
        status: { in: ["ADMIN_VERIFIED", "SOURCE_BACKED"] },
      },
      orderBy: { reviewedAt: "desc" },
    })
  )
    .map((c) => ({ c, parsed: extractionSchema.safeParse(c.payload) }))
    .find((x) => x.parsed.success && x.parsed.data.program);
  if (!base) throw new Error("No approved candidate names " + p.title);
  const payload = extractionSchema.parse({
    ...base.parsed.data,
    academicYear: "2027",
    requirements,
    intakes: [],
    costs: [],
    documents: [],
    scholarships: [],
    ambiguities: [],
  });
  const candidate = await db.extractionCandidate.create({
    data: {
      jobId: job!.id,
      documentId: base.c.documentId,
      programId: p.id,
      payload,
      issues: [],
    },
  });
  await reviewCandidate(candidate.id, "APPROVE", reviewer, payload, false, {
    status: "SOURCE_BACKED",
  });
  await db.$transaction([
    db.admissionRequirement.deleteMany({
      where: { id: { in: p.requirements.map((x) => x.id) } },
    }),
    db.reviewRecord.create({
      data: {
        candidateId: candidate.id,
        action: "SUPERSEDED_REQUIREMENTS",
        previousValue: JSON.parse(JSON.stringify(p.requirements)),
        revisedValue: { requirements: requirements.map((x) => x.label) },
        administratorIdentity: reviewer,
      },
    }),
  ]);
}
console.log(`CUHK requirement sets ${apply ? "rebuilt" : "to rebuild"}.`);
if (!apply) console.log("Dry run. Set APPLY=1 to write.");
process.exit(0);
