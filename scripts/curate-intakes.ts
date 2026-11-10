import { db } from "../lib/db";
import { extractionSchema, type Extraction } from "../lib/research/extraction";
import { reviewCandidate } from "../lib/research/review";
import { curationJob, latestDocument, quoter } from "./curation";
// Intakes re-quoted from the current official date tables (2026-11-10, delegated by the project owner).
// - HKUST: the page changed its date format ("25 Nov" became "Nov. 25"), so the earlier quotations no longer
//   appear on it and those intakes aged out. Two routes for 2027 entry: Priority Round (deadline 25 Nov 2026)
//   and rolling applications (closing 30 Jun 2027).
// - CUHK: the rounds were stored with the round as the term ("Advance Offer Round"), so a Fall 2027 profile found
//   no intake. The same table states "Early Sep 2027 1st teaching term commences", so the term is Fall and the
//   round becomes the route (plan W6 hygiene rule), as in the owner-reviewed flagships.
// Each published programme of UNIVERSITY gets these intakes; approval pins the dates to Hong Kong time. Earlier
// intake rows are removed after approval and kept in a ReviewRecord. SOURCE_BACKED. Dry run by default; APPLY=1 writes.
const apply = process.env.APPLY === "1";
const universityId = process.env.UNIVERSITY ?? "";
const reviewer = `claude-code (${universityId.toUpperCase()} important dates re-quoted on 2026-11-10, delegated by project owner)`;
const plans: Record<
  string,
  {
    url: string;
    start: string;
    end: string;
    intakes: (cited: {
      excerpt: string;
      sourceUrl: string;
    }) => Extraction["intakes"];
  }
> = {
  hkust: {
    url: "https://join.hkust.edu.hk/admissions/international-qualifications",
    start: "Important Dates",
    end: "Application Closes",
    intakes: (dates) => [
      {
        academicYear: "2027",
        term: "Fall",
        route: "International qualifications: Priority Round",
        openDate: "2026-10-02T00:00:00Z",
        deadline: "2026-11-25T00:00:00Z",
        timezone: null,
        ...dates,
      },
      {
        academicYear: "2027",
        term: "Fall",
        route: "International qualifications: rolling round",
        openDate: "2026-10-02T00:00:00Z",
        deadline: "2027-06-30T00:00:00Z",
        timezone: null,
        ...dates,
      },
    ],
  },
  cuhk: {
    url: "https://admission.cuhk.edu.hk/application/overseas-other-qualifications-non-local-international-team/important-dates/",
    start: "2027 Admissions Exercise",
    end: "1st teaching term commences",
    intakes: (dates) => [
      {
        academicYear: "2027",
        term: "Fall",
        route: "Advance Offer Round: Overseas / Other Qualifications",
        openDate: "2026-10-02T00:00:00Z",
        deadline: "2026-11-12T00:00:00Z",
        timezone: null,
        ...dates,
      },
      {
        academicYear: "2027",
        term: "Fall",
        route: "Regular Round: Overseas / Other Qualifications",
        openDate: "2026-10-02T00:00:00Z",
        deadline: "2027-01-07T00:00:00Z",
        timezone: null,
        ...dates,
      },
    ],
  },
};
const plan = plans[universityId];
if (!plan)
  throw new Error("Set UNIVERSITY to one of: " + Object.keys(plans).join(", "));
const url = plan.url;
const page = await latestDocument(universityId, url);
if (!page) throw new Error("Not stored: " + url);
const dates = quoter(url, page.text)(plan.start, plan.end);
const intakes = plan.intakes(dates);
console.log("Quote:", dates.excerpt);
const programs = await db.degreeProgram.findMany({
  where: { universityId, published: true },
  include: { intakes: true },
  orderBy: { title: "asc" },
});
const job = apply
  ? await curationJob(
      universityId,
      universityId.toUpperCase() + " intakes 2026-11-10",
    )
  : null;
for (const p of programs) {
  console.log(
    `   ${p.title}: ${p.intakes.length} old intakes -> ${intakes.length}`,
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
    requirements: [],
    intakes,
    costs: [],
    documents: [],
    scholarships: [],
    ambiguities: [],
  });
  const candidate = await db.extractionCandidate.create({
    data: {
      jobId: job!.id,
      documentId: page.id,
      programId: p.id,
      payload,
      issues: [],
    },
  });
  await reviewCandidate(candidate.id, "APPROVE", reviewer, payload, false, {
    status: "SOURCE_BACKED",
  });
  await db.$transaction([
    db.applicationIntake.deleteMany({
      where: { id: { in: p.intakes.map((i) => i.id) } },
    }),
    db.reviewRecord.create({
      data: {
        candidateId: candidate.id,
        action: "SUPERSEDED_INTAKES",
        previousValue: JSON.parse(JSON.stringify(p.intakes)),
        revisedValue: { intakes: intakes.map((i) => i.route) },
        administratorIdentity: reviewer,
      },
    }),
  ]);
}
if (!apply) console.log("Dry run. Set APPLY=1 to write.");
process.exit(0);
