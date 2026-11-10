import { db } from "../lib/db";
import { extractionSchema, type Extraction } from "../lib/research/extraction";
import { reviewCandidate } from "../lib/research/review";
import { pages } from "../prisma/registry";
import { curationJob, latestDocument, quoter } from "./curation";
// W4 / W2d: HKUST requirement sets rebuilt from the stored official pages (2026-11-10, delegated by the project
// owner), in the pattern of the owner-reviewed flagships (scripts/curate-flagship.ts):
// - General entrance: IB Diploma, or passes in at least three GCE / International A-level subjects (the
//   A-level route is an OTHER rule scoped to A-level students, so it stays UNKNOWN). The allow-list names both;
//   other qualifications give "equivalency not verified".
// - English alternatives: IELTS 6.0, TOEFL, Duolingo 125, PTE 64.
// - Subject requirement quoted from the programme's own requirement page; application choice and interview
//   are informational (not mandatory).
// The model-extracted requirement rows they replace mixed country routes into applicant-wide lists; they are
// deleted and kept in a ReviewRecord. Rules are SOURCE_BACKED; requirementsComplete is left to
// `npm run review:auto` (checklist 3.2). Programmes already marked complete are left alone. APPLY=1 writes.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (HKUST requirement pages checked on 2026-11-10, delegated by project owner)";
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
const filter = (general: string, language: string, program = "All") =>
  `https://join.hkust.edu.hk/admissions/international-qualifications?general_requirement=${general}&language_requirement=${language}&program_requirement=${program}`;
async function q(url: string) {
  const doc = await latestDocument("hkust", url);
  if (!doc) throw new Error("Not stored: " + url);
  return quoter(url, doc.text);
}
const ib = await q(filter("46205", "46244"));
const alevel = await q(filter("46185", "46245"));
const toefl = await q(filter("All", "46245"));
const det = await q(filter("All", "46747"));
const pte = await q(filter("All", "46748"));
const shared: Requirement[] = [
  rule(
    "QUALIFICATION",
    "General entrance requirement: IB Diploma, or GCE / International A-level (the other accepted qualifications on the official page are not yet encoded)",
    ib("International Baccalaureate (IB) IB Diploma"),
    { allowed: ["IB Diploma", "GCE A-Level", "International A-Level"] },
  ),
  rule(
    "OTHER",
    "A-level route: high school graduation and passes in at least three Advanced Level subjects in the GCEAL / International AL examinations (or a BTEC National Level 3 Extended Diploma)",
    alevel(
      "British-patterned (e.g. GCEAL/IAL) High school graduation",
      "BTEC National Level 3 Extended Diploma",
    ),
    { appliesToQualifications: ["GCE A-Level", "International A-Level"] },
  ),
  rule(
    "IELTS",
    english + "IELTS Academic overall band 6.0",
    ib(
      "IELTS (International English Language Testing System) Academic",
      "Overall Band: 6.0",
    ),
    { minimum: 6, scale: "IELTS Academic overall band" },
  ),
  rule(
    "OTHER",
    english +
      "TOEFL total score 80 (tests before 21 January 2026) or 4.5 (from 21 January 2026), in one sitting",
    toefl("Prior to 21 January 2026", "Total Score (in one sitting): 4.5"),
  ),
  rule(
    "DUOLINGO",
    english + "Duolingo English Test overall 125",
    det("Duolingo English Test (DET)", "Overall score 125"),
    { minimum: 125, scale: "DET overall" },
  ),
  rule(
    "PTE",
    english + "PTE Academic overall 64 with no sub-score below 60",
    pte(
      "Pearson Test of English Academic (PTE Academic)",
      "no sub-score below 60",
    ),
    { minimum: 64, scale: "PTE Academic overall" },
  ),
];
/** The programme's row of the "Subject-specific Requirements/ Interview" table on its own requirement page. */
async function own(url: string) {
  const doc = await latestDocument("hkust", url);
  if (!doc) throw new Error("Not stored: " + url);
  const t = doc.text;
  const from = t.indexOf(
    "\n Interview\n",
    t.indexOf("Subject-specific Requirements/ Interview"),
  );
  const to = t.indexOf(" LPM Block\n English Language Requirements", from);
  if (from < 0 || to < 0) throw new Error("No subject table on " + url);
  const lines = t
    .slice(from + 12, to)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Quotes come from the table only (its first words also appear in the page's programme menu).
  const quote = quoter(url, t.slice(from, to));
  const rules: Requirement[] = [];
  const body = lines.slice(1).join(" ");
  const choice = lines[1].match(
    /^(.*?)(Students interested in .*?should apply to .*?\.)/,
  );
  if (choice)
    rules.push(
      rule("OTHER", "Application choice: " + choice[2], quote(choice[2]), {
        mandatory: false,
      }),
    );
  const interview = body.match(/Interview is (not )?compulsory/);
  if (!interview) throw new Error("No interview line on " + url);
  if (!interview[1])
    rules.push(
      rule(
        "OTHER",
        "Interview is compulsory",
        quote(lines.find((l) => l.includes("Interview is compulsory"))!),
        { mandatory: false },
      ),
    );
  if (/No specific subject requirements/.test(body))
    return { rules, subjects: null };
  // From the first subject line (after the application choice and its notes) to the interview note.
  const first = lines.findIndex(
    (l, i) => i > 1 && /Mathematics|^Science \(Group|^Engineering$/.test(l),
  );
  if (first < 0) throw new Error("No subject line on " + url);
  const last = lines.findIndex(
    (l, i) => i >= first && /Interview is|^\* Click here/.test(l),
  );
  const text = lines
    .slice(first, last + 1)
    .join(" ")
    .replace(/(\* Click here.*|Interview is.*)$/, "")
    .trim();
  const subjects = rule(
    "OTHER",
    "Subject requirement: " + text.replace(/Preferred:.*$/, "").trim(),
    // A one-word requirement ("Mathematics") is quoted with the programme line above it.
    quote(
      text.length < 20 ? lines[first - 1] : lines[first],
      text
        .replace(/Preferred:.*$/, "")
        .trim()
        .split(" ")
        .slice(-3)
        .join(" "),
    ),
  );
  rules.push(subjects);
  return { rules, subjects: subjects.label };
}
const scoped = pages.filter((p) => p.universityId === "hkust" && p.program);
const programs = await db.degreeProgram.findMany({
  where: { universityId: "hkust", published: true },
  include: { requirements: true },
  orderBy: { title: "asc" },
});
const job = apply
  ? await curationJob("hkust", "HKUST requirement sets 2026-11-10")
  : null;
let done = 0;
for (const p of programs) {
  if (p.requirementsComplete) {
    console.log("   keep (already complete):", p.title);
    continue;
  }
  const page = scoped.find((s) => [s.program].flat().includes(p.title));
  if (!page) {
    console.log("   skip (no requirement page registered):", p.title);
    continue;
  }
  const { rules, subjects } = await own(page.url);
  const requirements = [...shared, ...rules];
  console.log(
    `   ${p.title}: ${subjects ?? "no specific subject requirements"} (${p.requirements.length} old rules -> ${requirements.length})`,
  );
  done++;
  if (!apply) continue;
  // The latest approved candidate that names the programme (cost-only curation candidates name none).
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
  // Approve first, then remove the rows that were there before, so a failed approval removes nothing.
  await reviewCandidate(candidate.id, "APPROVE", reviewer, payload, false, {
    status: "SOURCE_BACKED",
  });
  await db.$transaction([
    db.admissionRequirement.deleteMany({
      where: { id: { in: p.requirements.map((r) => r.id) } },
    }),
    db.reviewRecord.create({
      data: {
        candidateId: candidate.id,
        action: "SUPERSEDED_REQUIREMENTS",
        previousValue: JSON.parse(JSON.stringify(p.requirements)),
        revisedValue: { requirements: requirements.map((r) => r.label) },
        administratorIdentity: reviewer,
      },
    }),
  ]);
}
console.log(`${done} HKUST programmes ${apply ? "rebuilt" : "to rebuild"}.`);
if (!apply) console.log("Dry run. Set APPLY=1 to write.");
process.exit(0);
