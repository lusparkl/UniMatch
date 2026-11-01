import { db } from "../lib/db";
import { extractionSchema, type Extraction } from "../lib/research/extraction";
import { reviewCandidate } from "../lib/research/review";
// Browser review of ten flagship programmes against their official pages (2026-11-01).
// Each programme is rebuilt from its latest approved payload with reviewer-written facts quoted from
// the stored official pages, then approved through the normal review path. APPLY=1 writes.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (browser check of official pages on 2026-11-01, delegated by project owner)";
const squash = (value: string) => value.replace(/[\s  -​ 　]+/g, " ").trim();
const pages = new Map<string, string>();
async function page(url: string) {
  if (!pages.has(url)) {
    const doc = await db.sourceDocument.findFirstOrThrow({
      where: { url },
      orderBy: { retrievedAt: "desc" },
    });
    pages.set(url, squash(doc.text));
  }
  return pages.get(url)!;
}
// A verbatim excerpt from `start` through `end`; `start` is the occurrence nearest before `end`.
async function quote(url: string, start: string, end = start) {
  const text = await page(url);
  const endAt = text.indexOf(end);
  if (endAt < 0) throw new Error(`"${end}" not found in ${url}`);
  const startAt = text.lastIndexOf(start, endAt);
  if (startAt < 0)
    throw new Error(`"${start}" not found before "${end}" in ${url}`);
  const excerpt = text.slice(startAt, endAt + end.length);
  if (excerpt.length > 1200)
    throw new Error(`Excerpt over 1200 characters in ${url}`);
  return { excerpt, sourceUrl: url };
}
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
const ib = (cited: { excerpt: string; sourceUrl: string }) =>
  rule(
    "QUALIFICATION",
    "General entrance requirement: IB Diploma (the other accepted qualifications on the official page are not yet encoded)",
    cited,
    { allowed: ["IB Diploma"] },
  );
const english = "English proof (any one accepted test): ";
const hkt = "Asia/Hong_Kong";
type Plan = {
  id: string;
  complete: boolean;
  requirements?: Requirement[];
  intakes: Extraction["intakes"];
  // September entry rounds named by the page ("Regular Round") become Fall, keeping the round as the route.
  fall?: boolean;
  costs: Extraction["costs"];
  notes: string[];
};
const polyu = {
  general:
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-general",
  english:
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-english",
  fees: "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-other-fees-and",
  preferred:
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-preferred",
};
async function polyuPlan(id: string, url: string): Promise<Plan> {
  return {
    id,
    complete: true,
    requirements: [
      ib(
        await quote(
          polyu.general,
          "International Baccalaureate (IB) IB Diploma",
        ),
      ),
      rule(
        "IELTS",
        english + "IELTS (Academic) overall band 6.0 or above in one sitting",
        await quote(
          polyu.english,
          "IELTS (Academic)",
          "6.0 or above in one sitting",
        ),
        { minimum: 6, scale: "IELTS Academic overall band" },
      ),
      rule(
        "OTHER",
        english +
          "TOEFL iBT 80/120 for tests before 21 January 2026, or 4.5/6.0 from 21 January 2026, in one sitting",
        await quote(
          polyu.english,
          "(For tests taken before 21 January 2026)",
          "out of 6.0 in one sitting",
        ),
      ),
      rule(
        "OTHER",
        english +
          "Grade 4 or above in IB English or English Literature (HL/SL)",
        await quote(
          polyu.english,
          "Grade 4 or above in IB English or English Literature (HL/SL)",
        ),
      ),
    ],
    intakes: [
      {
        academicYear: "2027",
        term: "Fall",
        route: "Non-JUPAS Year 1: International / Other Qualification",
        openDate: null,
        deadline: "2026-11-17T00:00:00Z",
        timezone: null,
        // The deadline table of this "Sept 2027 Entry" page; its last row carries the year.
        ...(await quote(url, "Application Deadline", "2027年6月13日")),
      },
    ],
    costs: [
      {
        tuition: 240000,
        // Itemised accommodation + meals + personal expenses; the page's own total is lower (see notes).
        living: 18515 + 53040 + 18717,
        other: null,
        currency: "HKD",
        period: "ANNUAL",
        ...(await quote(
          polyu.fees,
          "Amount per academic year",
          "HK$290,272 (USD: 37,214)",
        )),
      },
    ],
    notes: [
      "No compulsory subject requirement (programme page) and no preferred subjects for international qualifications.",
      "Deadline 2026-11-17 has no time zone on the page; left without one.",
      "Official cost table items sum to HK$330,272 but the page states HK$290,272; itemised values kept. Rent is the 2026/27 rate. Other fees (caution money) have no amount, so total cost stays unknown.",
      "Other accepted English proofs (A-level, SAT, AP, national exams) are not encoded; they keep a low IELTS from becoming a FAIL.",
    ],
  };
}
const hkust = {
  ib: "https://join.hkust.edu.hk/admissions/international-qualifications?general_requirement=46205&language_requirement=46244&program_requirement=All",
  toefl:
    "https://join.hkust.edu.hk/admissions/international-qualifications?general_requirement=All&language_requirement=46245&program_requirement=All",
  duolingo:
    "https://join.hkust.edu.hk/admissions/international-qualifications?general_requirement=All&language_requirement=46747&program_requirement=All",
  pte: "https://join.hkust.edu.hk/admissions/international-qualifications?general_requirement=All&language_requirement=46748&program_requirement=All",
  dates: "https://join.hkust.edu.hk/admissions/international-qualifications",
  fees: "https://join.hkust.edu.hk/fees-and-scholarships",
};
const subjects = (id: string) =>
  `https://join.hkust.edu.hk/admissions/international-qualifications?general_requirement=All&language_requirement=All&program_requirement=${id}`;
async function hkustPlan(
  id: string,
  extra: Requirement[],
  notes: string[],
): Promise<Plan> {
  const dates = await quote(
    hkust.dates,
    "Important Dates",
    "Application Closes",
  );
  return {
    id,
    complete: true,
    requirements: [
      ib(await quote(hkust.ib, "International Baccalaureate (IB) IB Diploma")),
      ...extra,
      rule(
        "IELTS",
        english + "IELTS Academic overall band 6.0",
        await quote(
          hkust.ib,
          "IELTS (International English Language Testing System) Academic",
          "Overall Band: 6.0",
        ),
        { minimum: 6, scale: "IELTS Academic overall band" },
      ),
      rule(
        "OTHER",
        english +
          "TOEFL total score 80 (tests before 21 January 2026) or 4.5 (from 21 January 2026), in one sitting",
        await quote(
          hkust.toefl,
          "Prior to 21 January 2026",
          "Total Score (in one sitting): 4.5",
        ),
      ),
      rule(
        "DUOLINGO",
        english + "Duolingo English Test overall 125",
        await quote(
          hkust.duolingo,
          "Duolingo English Test (DET)",
          "Overall score 125",
        ),
        { minimum: 125, scale: "DET overall" },
      ),
      rule(
        "PTE",
        english + "PTE Academic overall 64 with no sub-score below 60",
        await quote(
          hkust.pte,
          "Pearson Test of English Academic (PTE Academic)",
          "no sub-score below 60",
        ),
        { minimum: 64, scale: "PTE Academic overall" },
      ),
    ],
    intakes: [
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
    costs: [
      {
        tuition: 260000,
        living: 65000,
        other: null,
        currency: "HKD",
        period: "ANNUAL",
        ...(await quote(
          hkust.fees,
          "Tuition Fee (Non-local Students)*",
          "(~USD 8,200)",
        )),
      },
    ],
    notes: [
      "IB has no minimum total: 35-41 is the mid-50% range of the 2026 intake, for reference only.",
      "Dates have no time zone on the page; left without one.",
      "University accommodation HK$21,000-51,000 per residential year (not per semester as previously stored) is a range, so total cost stays unknown.",
      "PTE sub-score minimum is in the label; the profile records only the overall score.",
      ...notes,
    ],
  };
}
const hku = {
  fees: "https://www.admissions.hku.hk/fees-and-scholarships/fees",
  dates: "https://www.admissions.hku.hk/apply/international-qualifications",
};
async function hkuPlan(
  id: string,
  tuition: string,
  amount: number,
): Promise<Plan> {
  return {
    id,
    complete: false,
    intakes: [
      {
        academicYear: "2027",
        term: "Fall",
        route: "International/Non-JUPAS Admissions Scheme: applications close",
        openDate: null,
        deadline: "2027-08-25T12:00:00+08:00",
        timezone: hkt,
        ...(await quote(
          hku.dates,
          "25 Aug",
          "Applications close at noon (HKT)",
        )),
      },
    ],
    costs: [
      {
        tuition: amount,
        living: null,
        other: null,
        currency: "HKD",
        period: "ANNUAL",
        ...(await quote(
          hku.fees,
          "Annual Tuition Fees for Local Students not Eligible",
          tuition,
        )),
      },
    ],
    notes: [
      "Programme-specific admission standards sit behind an interactive selector that rendered nothing on 2026-11-01; requirements are not verified as complete.",
      "First-round deadline 25 Nov 2026 noon (HKT) is not stored: the page does not tie it to the 2027 entry year in one excerpt.",
      "Living costs are listed as separate ranges (halls, off-campus, living), so no single annual living figure is stored.",
    ],
  };
}
const cuhkFees =
  "https://admission.cuhk.edu.hk/fees-financing-your-studies/fees/";
async function cuhkPlan(id: string): Promise<Plan> {
  return {
    id,
    complete: false,
    intakes: [],
    fall: true,
    costs: [
      {
        tuition: 230000,
        living: 17000 + 45000,
        other: null,
        currency: "HKD",
        period: "ANNUAL",
        ...(await quote(
          cuhkFees,
          "2027-2028 annual tuition fees for non-local students",
          "Living Expenses: about HK$45,000",
        )),
      },
    ],
    notes: [
      "IB route also requires Grade 4 in IB Chinese (Dean may exempt), stated only in the IB guide PDF that is not stored as evidence; not marked complete.",
      "IB subject lists in the guide are preferences, not requirements; there is no IB points minimum.",
    ],
  };
}
const plans: Promise<Plan>[] = [
  polyuPlan(
    "cmvwn5427005mmdv1pbram7vl",
    "https://www.polyu.edu.hk/study/ug/jupas/2027/js3003",
  ),
  polyuPlan(
    "cmvtb3n9l00055nv1tcm5smf7",
    "https://www.polyu.edu.hk/study/ug/jupas/2027/js3868",
  ),
  hkustPlan(
    "cmvtb3n9500005nv1miw2imev",
    [
      rule(
        "OTHER",
        "Subject requirement: senior level Mathematics, and one senior level subject from Physics, Chemistry, Biology, Computer Science",
        await quote(
          subjects("46308"),
          "Senior level Mathematics, and one senior level subject from Physics, Chemistry, Biology, Computer Science",
        ),
      ),
      rule(
        "OTHER",
        "Application choice: apply to 'Engineering with an Extended Major in Artificial Intelligence' or 'Computer Science and Engineering'; entry to this major is through major selection",
        await quote(
          subjects("46308"),
          "Students interested in BEng/BSc in Computer Science should apply to",
          "Department of Computer Science and Engineering.",
        ),
        { mandatory: false },
      ),
    ],
    [
      "Not a direct application choice: students apply to the Engineering AI extended major or to Computer Science and Engineering.",
    ],
  ),
  hkustPlan(
    "cmvwn53ue002rmdv1z27mvcvj",
    [
      rule(
        "OTHER",
        "Subject requirement: senior level Mathematics",
        await quote(
          subjects("46324"),
          "BSc in Economics and Finance Senior level Mathematics",
        ),
      ),
    ],
    [],
  ),
  hkuPlan("cmvsjcaei0003l1v1b7dq3zcd", "HK$ 280,000", 280000),
  hkuPlan("cmvwn53rq001qmdv1l6wx5pbu", "HK$ 250,000", 250000),
  cuhkPlan("cmvwknbdb00076ev1n29w0bto"),
  cuhkPlan("cmvwn53wy003qmdv1srcdtcvx"),
];
try {
  for (const plan of await Promise.all(plans)) {
    const program = await db.degreeProgram.findUniqueOrThrow({
      where: { id: plan.id },
    });
    const base = await db.extractionCandidate.findFirstOrThrow({
      where: { programId: plan.id, status: "ADMIN_VERIFIED" },
      orderBy: { reviewedAt: "desc" },
    });
    const before = extractionSchema.parse(base.payload);
    const payload = extractionSchema.parse({
      ...before,
      academicYear: "2027",
      requirements: plan.requirements ?? before.requirements,
      intakes: plan.intakes.length
        ? plan.intakes
        : plan.fall
          ? before.intakes.map((i) => ({
              ...i,
              term: "Fall",
              route: i.term + ": " + i.route,
            }))
          : before.intakes,
      costs: plan.costs,
      ambiguities: plan.notes,
    });
    console.log(
      `\n${program.universityId} ${program.title} | complete=${plan.complete} | req ${before.requirements.length}->${payload.requirements.length} intake ${before.intakes.length}->${payload.intakes.length} cost ${before.costs.length}->${payload.costs.length}`,
    );
    for (const n of plan.notes) console.log("   -", n);
    if (!apply) continue;
    const job = await db.researchJob.create({
      data: {
        universityId: program.universityId,
        targets: ["Reviewer curation: browser check 2026-11-01"],
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
        issues: plan.notes,
      },
    });
    await reviewCandidate(
      candidate.id,
      "APPROVE",
      reviewer,
      payload,
      plan.complete,
      {
        status: "ADMIN_VERIFIED",
        replace: true,
      },
    );
    console.log("   APPROVED");
  }
} finally {
  await db.$disconnect();
}
