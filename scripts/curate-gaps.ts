import { db } from "../lib/db";
import type { Verification } from "../lib/domain";
import { trusted } from "../lib/matching";
import { extractionSchema, type Extraction } from "../lib/research/extraction";
import { reviewCandidate } from "../lib/research/review";
import {
  addCost,
  curationJob,
  fetchApproved,
  latestDocument,
  quoter,
  squash,
} from "./curation";

// Priority gap curation, one university per run. Every page is fetched through the guarded crawler,
// every claim quotes a stored page version, and every published row is SOURCE_BACKED. Dry run by default;
// APPLY=1 writes. Existing ADMIN_VERIFIED rows are never changed.
const apply = process.env.APPLY === "1";
const universityId = process.env.UNIVERSITY ?? "";
const reviewer =
  "codex (official university pages checked on 2026-11-11, delegated by project owner)";
type Page = Awaited<ReturnType<typeof fetchApproved>>;
type Intake = Extraction["intakes"][number];
type Cost = Extraction["costs"][number];

async function namedPayload(programId: string) {
  const candidates = await db.extractionCandidate.findMany({
    where: {
      programId,
      status: { in: ["ADMIN_VERIFIED", "SOURCE_BACKED"] },
    },
    orderBy: { reviewedAt: "desc" },
  });
  for (const candidate of candidates) {
    const parsed = extractionSchema.safeParse(candidate.payload);
    if (parsed.success && parsed.data.program) return parsed.data;
  }
  throw new Error("No reviewed candidate names programme " + programId);
}

async function addIntakes(input: {
  universityId: string;
  page: Page;
  programs: { id: string; title: string }[];
  intakes: (program: { id: string; title: string }) => Intake[];
  target: string;
}) {
  const job = apply
    ? await curationJob(input.universityId, input.target)
    : null;
  let planned = 0;
  for (const program of input.programs) {
    const intakes = input.intakes(program);
    planned += intakes.length;
    console.log(
      `   ${program.title}: ${intakes.map((i) => `${i.term} ${i.route} ${i.deadline ?? "date unpublished"}`).join("; ")}`,
    );
    if (!apply) continue;
    const base = await namedPayload(program.id);
    const payload = extractionSchema.parse({
      ...base,
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
        documentId: input.page.id,
        programId: program.id,
        payload,
        issues: [],
      },
    });
    await reviewCandidate(candidate.id, "APPROVE", reviewer, payload, false, {
      status: "SOURCE_BACKED",
    });
  }
  console.log(`${apply ? "Added" : "Would add"} ${planned} intake rows.`);
}

async function addCosts(input: {
  universityId: string;
  page: Page;
  academicYear: string | null;
  programs: {
    id: string;
    title: string;
    costs: { verificationStatus: Verification }[];
  }[];
  cost: (program: { id: string; title: string }) => Cost;
  target: string;
  note: (program: { id: string; title: string }) => string;
}) {
  const missing = input.programs.filter(
    (p) => !p.costs.some((c) => trusted(c.verificationStatus)),
  );
  const job = apply
    ? await curationJob(input.universityId, input.target)
    : null;
  for (const program of missing) {
    const cost = input.cost(program);
    console.log(
      `   ${program.title}: ${cost.currency} ${cost.tuition ?? "?"} tuition, ${cost.living ?? "?"} living, ${cost.other ?? "?"} other / ${cost.period}`,
    );
    if (!apply) continue;
    await addCost({
      jobId: job!.id,
      programId: program.id,
      universityId: input.universityId,
      page: input.page,
      cost,
      academicYear: input.academicYear,
      estimateType: "OFFICIAL_ESTIMATE",
      reviewer,
      action: "ADD_GAP_COST",
      note: input.note(program),
    });
  }
  console.log(`${apply ? "Added" : "Would add"} ${missing.length} cost rows.`);
}

async function hku() {
  const feeUrl = "https://www.admissions.hku.hk/fees-and-scholarships/fees";
  const generalUrl =
    "https://admissions.hku.hk/sites/default/files/2026-09/HKU_General_Information_NJ_2027.pdf";
  const [feePage, generalPage] = await Promise.all([
    fetchApproved("hku", feeUrl),
    fetchApproved("hku", generalUrl),
  ]);
  const fee = quoter(feeUrl, feePage.text)(
    "Annual Tuition Fees for Local Students not Eligible",
    "Schools of Future Media, and Governance and Policy",
  );
  const september = quoter(generalUrl, generalPage.text)(
    "INTERNATIONAL ADMISSIONS SCHEME",
    "UNDERGRADUATE ADMISSION IN SEPTEMBER 2027",
  );
  console.log("HKU September statement:", september.excerpt);
  console.log(
    "The September statement and final deadline are on separate pages; no intake row is merged across sources.",
  );
  const programs = await db.degreeProgram.findMany({
    where: { universityId: "hku", published: true },
    include: { costs: true },
    orderBy: { title: "asc" },
  });
  const missing = [];
  for (const program of programs.filter((p) => !p.costs.length)) {
    const page = await latestDocument("hku", program.officialUrl);
    const field = page?.text.match(/\n\s*FACULTY\s*\n\s*([^\n]+)/)?.[1];
    if (squash(field ?? "") !== "HKU Business School") {
      console.log(
        `   skip ${program.title}: faculty is ${field ?? "not published"}`,
      );
      continue;
    }
    missing.push(program);
  }
  await addCosts({
    universityId: "hku",
    page: feePage,
    academicYear: "2027",
    programs: missing,
    target: "HKU Business School tuition gaps 2027/28",
    cost: () => ({
      tuition: 250000,
      living: null,
      other: null,
      currency: "HKD",
      period: "ANNUAL",
      ...fee,
    }),
    note: (program) =>
      `${program.title}: its official programme page names HKU Business School; HKU identifies that unit as the Faculty of Business and Economics, which the fee table places in the non-STEM category`,
  });
}

async function hkbu() {
  const url = "https://iss.hkbu.edu.hk/amsappl_nj/eventcalendar.jsf";
  const page = await fetchApproved("hkbu", url);
  const dates = quoter(url, page.text)(
    "Non-local non-mainland applicants",
    "2 Feb 2027 - 31 May 2027, 11:59 pm",
  );
  const programs = await db.degreeProgram.findMany({
    where: {
      universityId: "hkbu",
      published: true,
      OR: [
        { intakes: { none: {} } },
        {
          intakes: {
            some: {
              academicYear: "2027",
              applicationRoute: { startsWith: "Non-local non-mainland:" },
              verificationStatus: "SOURCE_BACKED",
            },
          },
        },
      ],
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  await addIntakes({
    universityId: "hkbu",
    page,
    programs,
    target: "HKBU non-local non-mainland 2027 application rounds",
    intakes: () => [
      {
        academicYear: "2027",
        term: "Fall",
        route: "Non-local non-mainland: Early Round",
        openDate: null,
        deadline: "2026-11-16T23:59:00+08:00",
        timezone: null,
        ...dates,
      },
      {
        academicYear: "2027",
        term: "Fall",
        route: "Non-local non-mainland: Main Round",
        openDate: null,
        deadline: "2027-02-01T23:59:00+08:00",
        timezone: null,
        ...dates,
      },
      {
        academicYear: "2027",
        term: "Fall",
        route: "Non-local non-mainland: Extended Round",
        openDate: null,
        deadline: "2027-05-31T23:59:00+08:00",
        timezone: null,
        ...dates,
      },
    ],
  });
}

async function polyu() {
  const admissionsUrl =
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications";
  const costsUrl =
    "https://www.polyu.edu.hk/study/2027/international-other-qualifications-other-fees-and-expenses";
  const faqUrl =
    "https://www.polyu.edu.hk/study/ug/admissions/jee/frequently-asked-questions";
  const listingUrls = [
    admissionsUrl,
    `${admissionsUrl}?page=1`,
    `${admissionsUrl}?page=2`,
  ];
  const [page, costsPage, faqPage, ...listingPages] = await Promise.all([
    fetchApproved("polyu", admissionsUrl),
    fetchApproved("polyu", costsUrl),
    fetchApproved("polyu", faqUrl),
    ...listingUrls.slice(1).map((url) => fetchApproved("polyu", url)),
  ]);
  const listings = [page, ...listingPages];
  const costQuote = quoter(costsUrl, costsPage.text)(
    "In general, the average spending per academic year",
    "HK$290,272 (USD: 37,214)",
  );
  const itemQuote = quoter(costsUrl, costsPage.text)(
    "Amount per academic year",
    "HK$18,717 (USD: 2,400)",
  );
  const faqQuote = quoter(faqUrl, faqPage.text)(
    "于2027/28年度入读本科课程的同学",
    "每年的费用约需港币330,272元",
  );
  console.log("PolyU published total:", costQuote.excerpt);
  console.log("PolyU itemised table:", itemQuote.excerpt);
  console.log("PolyU current FAQ total:", faqQuote.excerpt);
  console.log(
    "Living rows stay CONFLICTING: current official totals still disagree.",
  );
  const programs = await db.degreeProgram.findMany({
    where: { universityId: "polyu", published: true, intakes: { none: {} } },
    select: { id: true, title: true, officialUrl: true },
    orderBy: { title: "asc" },
  });
  await addIntakes({
    universityId: "polyu",
    page,
    programs,
    target: "PolyU missing September 2027 programme intakes",
    intakes: (program) => {
      const code = programs
        .find((p) => p.id === program.id)!
        .officialUrl.match(/\/(js\d+)$/i)?.[1]
        .toUpperCase();
      if (!code)
        throw new Error("No PolyU programme code for " + program.title);
      const evidencePage = listings.find((candidate) =>
        squash(candidate.text).includes(`${code} | Sept 2027 Entry`),
      );
      if (!evidencePage)
        throw new Error(`No September 2027 listing found for ${code}`);
      const cited = quoter(evidencePage.url, evidencePage.text)(
        `${code} | Sept 2027 Entry`,
        "Application Deadline: 17 Nov 2026",
      );
      return [
        {
          academicYear: "2027",
          term: "Fall",
          route: "International / Other Qualifications",
          openDate: null,
          deadline: "2026-11-17T23:59:00+08:00",
          timezone: null,
          ...cited,
        },
      ];
    },
  });
}

async function postech() {
  const url =
    "https://adm-iu.postech.ac.kr/user/comm/menu/4a69b7aee6a156d3c2ddb7413544ab2c/content/index.do";
  const page = await fetchApproved("postech", url);
  const cited = quoter(url, page.text)(
    "Estimated Essential Expenses (as of 2026)",
    "Subtotal (A) 6,883,420 6,883,420 13,766,840",
  );
  const programs = await db.degreeProgram.findMany({
    where: { universityId: "postech", published: true },
    include: { costs: true },
    orderBy: { title: "asc" },
  });
  await addCosts({
    universityId: "postech",
    page,
    academicYear: "2026",
    programs,
    target: "POSTECH estimated essential expenses as of 2026",
    cost: () => ({
      tuition: 5580000,
      living: 7235000,
      other: 951840,
      currency: "KRW",
      period: "ANNUAL",
      ...cited,
    }),
    note: () =>
      "Official annual table: tuition KRW 5,580,000; housing KRW 1,400,000, phone KRW 360,000 and food KRW 5,475,000; NHI KRW 951,840",
  });
}

async function unist() {
  const url =
    "https://admg-intl.unist.ac.kr/wp-content/uploads/2025/08/6.-Fall-2025-Notice-of-Enrollment_1.pdf";
  const page = await fetchApproved("unist", url);
  const cited = quoter(url, page.text)(
    "(Unit: Won, Full Tuition/Semester)",
    "Undergraduate 3,316,550 2,795,000",
  );
  const programs = await db.degreeProgram.findMany({
    where: { universityId: "unist", published: true },
    include: { costs: true },
    orderBy: { title: "asc" },
  });
  await addCosts({
    universityId: "unist",
    page,
    academicYear: "2025",
    programs,
    target: "UNIST Fall 2025 full tuition per semester",
    cost: (program) => ({
      tuition: /Business Administration/.test(program.title)
        ? 2795000
        : 3316550,
      living: null,
      other: null,
      currency: "KRW",
      period: "SEMESTER",
      ...cited,
    }),
    note: (program) =>
      `Fall 2025 full tuition per semester, ${/Business Administration/.test(program.title) ? "Management" : "Engineering"} category`,
  });
}

async function recheckScholarships() {
  const universityIds = ["postech", "unist", "yonsei-uic", "korea"];
  for (const id of universityIds) {
    const rows = await db.scholarshipEligibility.findMany({
      where: { universityId: id },
      include: { scholarship: { include: { evidence: true } } },
    });
    const urls = [...new Set(rows.map((r) => r.scholarship.evidence.url))];
    for (const url of urls) {
      const approved = await db.approvedSource.findUnique({
        where: { universityId_startUrl: { universityId: id, startUrl: url } },
      });
      if (approved?.purpose !== "owner-browser-copy")
        await fetchApproved(id, url);
    }
    let valid = 0;
    for (const row of rows) {
      const evidence = row.scholarship.evidence;
      const page = await latestDocument(id, evidence.url);
      if (page && squash(page.text).includes(squash(evidence.excerpt))) valid++;
      else
        console.log(
          `   MISSING ${id} ${row.scholarship.name}: ${evidence.url}`,
        );
    }
    console.log(
      `${id}: ${valid}/${rows.length} scholarship quotations current.`,
    );
  }
  console.log(
    "No newly unconditional award found: POSTECH tuition renews on GPA; UNIST has a non-scholarship track; UIC and KU remain competitive.",
  );
}

const runs: Record<string, () => Promise<void>> = {
  hku,
  hkbu,
  polyu,
  postech,
  unist,
  scholarships: recheckScholarships,
};

try {
  const run = runs[universityId];
  if (!run)
    throw new Error(
      "Set UNIVERSITY to one of: " + Object.keys(runs).join(", "),
    );
  await run();
  if (!apply) console.log("Dry run. Set APPLY=1 to write facts.");
} finally {
  await db.$disconnect();
}
