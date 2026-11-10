import { db } from "../lib/db";
import { extractionSchema, type Extraction } from "../lib/research/extraction";
import { reviewCandidate } from "../lib/research/review";
import { programs as registered } from "../prisma/registry";
import { curationJob, fetchApproved, quoter } from "./curation";
// W5: South Korea facts for the registered programmes, quoted from the official pages as fetched through the
// guarded crawler on 2026-11-10 (delegated by the project owner; no model calls). Only what the pages state:
// - Eligibility (applicant and parents non-Korean, or entire schooling abroad) is an OTHER rule: the profile has
//   no parents' citizenship, so it stays UNKNOWN. No accepted-qualification list is published (any recognised
//   high school graduation), so no programme can be marked requirementsComplete.
// - English: UNIST asks for a test report with no minimum (native-English countries exempt); KU requires English
//   proof for International Studies without a stated minimum; KAIST and POSTECH publish no 2027 English rule
//   (KAIST's guideline PDF is the 2025 edition; POSTECH's Fall 2027 guideline appears in early 2027).
// - Costs: KAIST's cost of attendance (annual, no academic year stated); KU tuition per semester for 2026.
//   UNIST tuition is given without a period, so it is not stored. POSTECH publishes no cost table on these pages.
// - Scholarships: GUARANTEED only where the page says every admitted international student receives it (KAIST
//   Scholarship, POSTECH tuition waiver and living allowance); these need the owner (docs/OWNER_CONFIRM.md).
// Each programme gets one candidate per evidence year. Programmes that already have rules are skipped
// (idempotent). SOURCE_BACKED. Dry run by default; APPLY=1 writes.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (South Korea official pages checked on 2026-11-10, delegated by project owner)";
type Requirement = Extraction["requirements"][number];
type Scholarship = Extraction["scholarships"][number];
type Cited = { excerpt: string; sourceUrl: string };
type Part = Pick<
  Extraction,
  "requirements" | "intakes" | "costs" | "scholarships"
>;
const rule = (
  label: string,
  cited: Cited,
  extra: Partial<Requirement> = {},
): Requirement => ({
  type: "OTHER",
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
const scholarship = (
  s: Partial<Scholarship> &
    Pick<Scholarship, "name" | "provider" | "officialUrl" | "fundingCategory"> &
    Cited,
): Scholarship => ({
  degreeLevels: ["BACHELOR"],
  nationalities: [],
  rules: [],
  tuitionCoverage: null,
  stipendAmount: null,
  currency: null,
  accommodation: null,
  travel: null,
  insurance: null,
  deadline: null,
  renewalConditions: null,
  ...s,
});
const pages = new Map<string, Awaited<ReturnType<typeof fetchApproved>>>();
async function q(universityId: string, url: string) {
  if (!pages.has(url)) pages.set(url, await fetchApproved(universityId, url));
  return quoter(url, pages.get(url)!.text);
}
const none: Part = {
  requirements: [],
  intakes: [],
  costs: [],
  scholarships: [],
};

// --- KAIST ---
const kaist = {
  majors: "https://admission.kaist.ac.kr/intl-undergraduate/before/sub01",
  eligibility: "https://admission.kaist.ac.kr/intl-undergraduate/before/sub02",
  timeline:
    "https://admission.kaist.ac.kr/intl-undergraduate/application/ApplicationGuide/ApplicationTimeline",
  coa: "https://admission.kaist.ac.kr/intl-undergraduate/support/coa",
  scholarship:
    "https://admission.kaist.ac.kr/intl-undergraduate/support/scholarships/kaist",
};
async function kaistFacts(): Promise<Record<string, Part>> {
  const e = await q("kaist", kaist.eligibility);
  const t = await q("kaist", kaist.timeline);
  const c = await q("kaist", kaist.coa);
  const s = await q("kaist", kaist.scholarship);
  const dates = t(
    "Application Timeline for 2027 Admissions",
    "January 14, 2027, 6:00 PM (KST)",
  );
  return {
    "2027": {
      requirements: [
        rule(
          "Eligibility: foreign citizenship (Korean or dual Korean citizens are not eligible), and either neither parent is a Korean citizen or, for applicants of Korean origin, all of elementary, junior high and high school completed outside Korea",
          e(
            "Applicants with foreign citizenship",
            "equivalent level of that provided in Korea.",
          ),
        ),
        rule(
          "High school graduation by August 31, 2027 for the Fall 2027 semester (by February 28, 2027 for Spring)",
          e("Spring Semester, 2027 (Early only)", "by August 31st, 2027."),
        ),
      ],
      intakes: [
        {
          academicYear: "2027",
          term: "Spring",
          route: "International admissions: Early (Spring track)",
          openDate: "2026-09-22T00:00:00Z",
          deadline: "2026-10-22T18:00:00+09:00",
          timezone: null,
          ...dates,
        },
        {
          academicYear: "2027",
          term: "Fall",
          route: "International admissions: Early (Fall track)",
          openDate: "2026-09-22T00:00:00Z",
          deadline: "2026-10-22T18:00:00+09:00",
          timezone: null,
          ...dates,
        },
        {
          academicYear: "2027",
          term: "Fall",
          route: "International admissions: Regular (Fall track only)",
          openDate: "2026-11-10T00:00:00Z",
          deadline: "2027-01-14T18:00:00+09:00",
          timezone: null,
          ...dates,
        },
      ],
      costs: [],
      scholarships: [
        scholarship({
          name: "KAIST Scholarship (international undergraduate admission)",
          provider: "KAIST",
          officialUrl: kaist.scholarship,
          fundingCategory: "GUARANTEED",
          tuitionCoverage: 1,
          // The page states KRW 350,000 per month; an annual stipend is stored only where a quote states it.
          insurance: "Medical health insurance",
          renewalConditions:
            "Living expenses KRW 350,000 per month. Students must maintain GPA over 2.7 out of 4.3 at KAIST after their freshman year",
          ...s(
            "Eligibility",
            "you will automatically be entitled to the KAIST Scholarship.",
          ),
        }),
      ],
    },
    // The cost table names no academic year ("Subject to change by the inflation of general price").
    none: {
      ...none,
      costs: [
        {
          tuition: 6866000,
          living: 1328000 + 5475000,
          other: 916680 + 300000,
          currency: "KRW",
          period: "ANNUAL",
          ...c("Essential Costs", "14,885,680"),
        },
      ],
    },
  };
}

// --- POSTECH ---
const postech = {
  guide:
    "https://adm-iu.postech.ac.kr/user/comm/menu/3317587a17a23d4dacdb9ffc4762bf4a/content/index.do",
  majors:
    "https://adm-iu.postech.ac.kr/user/comm/menu/b7f8c54d6eaff431c253db1c8b9bcb45/content/index.do",
  scholarship:
    "https://adm-iu.postech.ac.kr/user/comm/menu/e2afb97fa1b8f43c574be0dabef78f87/content/index.do",
};
async function postechFacts(): Promise<Record<string, Part>> {
  const g = await q("postech", postech.guide);
  const s = await q("postech", postech.scholarship);
  return {
    "2027": {
      requirements: [
        rule(
          "Eligibility (International Admissions): the applicant and both parents hold non-Korean citizenship, and the applicant graduates from high school by the date in the admissions guidelines",
          g(
            "International Admissions ● Both applicants and their parents must hold non-Korean citizenship.",
            "by the date specified in the applicable Admissions Guidelines.",
          ),
        ),
        rule(
          "High school qualification from a government-authorized institution (GED, homeschooling, online or distance learning not accepted)",
          g(
            "Only applicants holding high school qualifications from government-authorized institutions are eligible.",
            "not considered equivalent to a high school diploma.",
          ),
        ),
      ],
      intakes: [
        {
          academicYear: "2027",
          term: "Spring",
          route: "International Admissions",
          openDate: "2026-08-25T00:00:00Z",
          deadline: "2026-09-02T00:00:00Z",
          timezone: null,
          ...g(
            "[2027 Spring] International Admissions",
            "25 August 2026 - 2 September 2026",
          ),
        },
        {
          academicYear: "2027",
          term: "Fall",
          route:
            "International Admissions (application period late March to early April 2027; exact dates not yet published)",
          openDate: null,
          deadline: null,
          timezone: null,
          ...g(
            "[2027 Fall] International Admissions",
            "Late March 2027 - Early April 2027",
          ),
        },
      ],
      costs: [],
      scholarships: [
        scholarship({
          name: "POSTECH Tuition Scholarship (tuition waiver)",
          provider: "POSTECH",
          officialUrl: postech.scholarship,
          fundingCategory: "GUARANTEED",
          tuitionCoverage: 1,
          renewalConditions:
            "First semester waived for all admitted students; from the second semester, up to eight regular semesters subject to POSTECH's criteria, including a minimum GPA of 3.0 out of 4.3 in the previous semester",
          ...s(
            "Tuition Scholarship",
            "including a minimum GPA of 3.0 out of 4.3 in the previous semester.",
          ),
        }),
        scholarship({
          name: "POSTECH Living Allowance (International Admissions, KRW 500,000 per month)",
          provider: "POSTECH",
          officialUrl: postech.scholarship,
          fundingCategory: "GUARANTEED",
          renewalConditions:
            "All international undergraduate students (no GPA requirements); monthly amount, including vacation periods",
          ...s("Living Allowance", "(no GPA requirements)"),
        }),
      ],
    },
  };
}

// --- UNIST ---
const unist = {
  guide:
    "https://admu-intl.unist.ac.kr/admission-eng/admissions/admissions.do?articleNo=306812&attachNo=591437&mode=download",
  scholarship:
    "https://admu-intl.unist.ac.kr/admission-eng/life/scholarships.do",
};
async function unistFacts(
  field: "Engineering" | "Business",
): Promise<Record<string, Part>> {
  const g = await q("unist", unist.guide);
  const s = await q("unist", unist.scholarship);
  return {
    "2027": {
      requirements: [
        rule(
          "Eligibility: high school graduation by the start of Fall 2027, and either (foreign citizens) neither parent is a Korean citizen, or all of elementary, middle and high school completed outside Korea",
          g(
            "2. Admission Eligibility",
            "at a level equivalent to that provided in Korea.",
          ),
        ),
        rule(
          "English test report (TOEFL, IELTS, TEPS or TOEIC; no minimum score is stated); applicants from the U.S., Canada, the U.K., Australia, New Zealand and Ireland are exempt",
          g(
            "Applicants from the following native English-speaking countries are exempt",
            "New Zealand, and Ireland.",
          ),
        ),
        rule(
          `Field chosen on application: ${field}; the major is declared during study`,
          g(
            "Applicants must select their academic field (Engineering or Business) upon application.",
          ),
          { mandatory: false },
        ),
      ],
      intakes: [
        {
          academicYear: "2027",
          term: "Fall",
          route: "International undergraduate admission",
          openDate: "2026-12-02T09:00:00+09:00",
          deadline: "2027-01-22T16:00:00+09:00",
          timezone: null,
          ...g(
            "Online application Dec. 2, 2026",
            "Jan. 22, 2027 (Fri) 16:00 (KST)",
          ),
        },
      ],
      costs: [],
      scholarships: [
        scholarship({
          name: "UNIST tuition scholarship (full waiver)",
          provider: "UNIST",
          officialUrl: unist.scholarship,
          // The guideline also admits students through a non-scholarship track, so it is not guaranteed.
          fundingCategory: "COMPETITIVE",
          tuitionCoverage: 1,
          renewalConditions:
            "Full waiver in the first term for freshmen; afterwards 12 credits and GPA 2.7 or above in the previous term (half waiver from GPA 2.0)",
          ...s(
            "Tuition Fees Fully waived",
            "All Freshmen gets full scholarship in their 1st term",
          ),
        }),
      ],
    },
  };
}

// --- Korea University ---
const ku = {
  guide:
    "https://oia.korea.ac.kr/_attach/file/2026/08/lpZzpFXiuEfpfIZPBrYB.pdf",
  tuition: "https://oia.korea.ac.kr/oia2026/Tuition.do",
  scholarship: "https://oia.korea.ac.kr/oia2026/KU-Scholarships.do",
};
async function kuFacts(): Promise<Record<string, Part>> {
  const g = await q("korea", ku.guide);
  const t = await q("korea", ku.tuition);
  const s = await q("korea", ku.scholarship);
  return {
    "2027": {
      requirements: [
        rule(
          "Eligibility: the applicant and the applicant's parent(s) are non-Korean citizens, with primary and secondary education equivalent to grades 1 to 12",
          g(
            "Both the applicant and the applicant’s parent(s) must be non-Korean citizens.",
            "either in Korea or overseas",
          ),
        ),
        rule(
          "English proof required for the International Studies major (English track): TOEFL iBT or IELTS Academic score report (no minimum score is stated)",
          g(
            "A score report for TOEFL iBT",
            "English language qualification is mandatory.",
          ),
        ),
      ],
      intakes: [
        {
          academicYear: "2027",
          term: "Spring",
          route: "International Undergraduate Admission",
          openDate: "2026-08-03T10:00:00+09:00",
          deadline: "2026-08-31T17:00:00+09:00",
          timezone: null,
          ...g(
            "Key Changes for the 2027 Academic Year",
            "August 31, 2026 (17:00)",
          ),
        },
      ],
      costs: [],
      scholarships: [
        scholarship({
          name: "Anam Global Scholarship",
          provider: "Korea University",
          officialUrl: ku.scholarship,
          // Automatic consideration, awarded by admission evaluation.
          fundingCategory: "COMPETITIVE",
          tuitionCoverage: 1,
          renewalConditions:
            "At least 12 credits and GPA 3.5 or higher in the previous semester",
          ...s(
            "Anam Global Scholarship",
            "GPA of 3.5 or higher in the previous semester.",
          ),
        }),
      ],
    },
    "2026": {
      ...none,
      costs: [
        {
          tuition: 5800000,
          living: null,
          other: null,
          currency: "KRW",
          period: "SEMESTER",
          ...t(
            "※ as of 2026 academic year / per semester",
            "Approx. 5,800,000",
          ),
        },
      ],
    },
  };
}

const programmeQuote: Record<string, [string, string?]> = {
  "kaist|BS in Computer Science": [
    "Computer Science (https://engineering.kaist.ac.kr/education/departmentDetail?idx=77)",
  ],
  "kaist|BS in Electrical Engineering": [
    "Electrical Engineering (https://engineering.kaist.ac.kr/education/departmentDetail?idx=76)",
  ],
  "kaist|BS in Mechanical Engineering": [
    "Mechanical Engineering (https://engineering.kaist.ac.kr/education/departmentDetail?idx=74)",
  ],
  "kaist|BS in Industrial & Systems Engineering": [
    "Industrial & Systems Engineering (https://engineering.kaist.ac.kr/education/departmentDetail?idx=89)",
  ],
  "kaist|BS in Business and Technology Management": [
    "5) College of Business",
    "Business and Technology Management",
  ],
  "kaist|BS in Mathematical Sciences": [
    "Matematical Sciences (https://natsci.kaist.ac.kr/eng/sub0202)",
  ],
  "postech|BS in Computer Science & Engineering": [
    "Computer Science & Engineering view more",
  ],
  "postech|BS in Electrical Engineering": ["Electrical Engineering view more"],
  "postech|BS in Mechanical Engineering": ["Mechanical Engineering view more"],
  "postech|BS in Industrial & Management Engineering": [
    "Industrial & Management Engineering view more",
  ],
  "postech|BS in Mathematics": ["Mathematics view more"],
  "postech|BS in Physics": ["Physics view more"],
  "unist|BS in Computer Science and Engineering": [
    "Department of Computer Science and Engineering",
  ],
  "unist|BS in Electrical Engineering": [
    "Department of Electrical Engineering",
  ],
  "unist|BS in Mechanical Engineering": [
    "Department of Mechanical Engineering",
  ],
  "unist|BS in Industrial Engineering": [
    "Department of Industrial Engineering",
  ],
  "unist|BS in Biomedical Engineering": [
    "Department of Biomedical Engineering",
  ],
  "unist|BBA in Business Administration": [
    "Business School of Business Administration",
  ],
  "korea|International Studies (English Track)": [
    "College of International Studies Humanities International Studies (English Track)",
  ],
};
const facts: Record<string, () => Promise<Record<string, Part>>> = {
  kaist: kaistFacts,
  postech: postechFacts,
  korea: kuFacts,
};
const job = new Map<string, string>();
let planned = 0;
for (const entry of registered.filter((p) =>
  ["kaist", "postech", "unist", "korea"].includes(p.universityId),
)) {
  const program = await db.degreeProgram.findUniqueOrThrow({
    where: {
      universityId_title_degreeLevel: {
        universityId: entry.universityId,
        title: entry.title,
        degreeLevel: entry.degreeLevel,
      },
    },
    include: { requirements: true },
  });
  if (program.requirements.length) {
    console.log("   skip (already curated):", entry.title);
    continue;
  }
  const [start, end] = programmeQuote[entry.universityId + "|" + entry.title];
  const own = (await q(entry.universityId, entry.officialUrl))(start, end);
  const byYear =
    entry.universityId === "unist"
      ? await unistFacts(
          /Business/.test(entry.title) ? "Business" : "Engineering",
        )
      : await facts[entry.universityId]();
  const claims = Object.values(byYear).reduce(
    (n, p) =>
      n +
      p.requirements.length +
      p.intakes.length +
      p.costs.length +
      p.scholarships.length,
    0,
  );
  console.log(
    `   ${entry.universityId} | ${entry.title}: ${claims} claims in ${Object.keys(byYear).length} candidate(s)`,
  );
  planned++;
  if (!apply) continue;
  if (!job.has(entry.universityId))
    job.set(
      entry.universityId,
      (await curationJob(entry.universityId, "South Korea pages 2026-11-10"))
        .id,
    );
  for (const [year, part] of Object.entries(byYear)) {
    const payload = extractionSchema.parse({
      program: {
        title: entry.title,
        degreeLevel: entry.degreeLevel,
        fieldOfStudy: entry.fieldOfStudy,
        teachingLanguage: entry.universityId === "korea" ? "English" : null,
        duration: null,
        officialUrl: entry.officialUrl,
        ...own,
      },
      academicYear: year === "none" ? null : year,
      ...part,
      documents: [],
      ambiguities: [],
    });
    const candidate = await db.extractionCandidate.create({
      data: {
        jobId: job.get(entry.universityId)!,
        documentId: pages.get(entry.officialUrl)!.id,
        programId: program.id,
        payload,
        issues: [],
      },
    });
    await reviewCandidate(candidate.id, "APPROVE", reviewer, payload, false, {
      status: "SOURCE_BACKED",
    });
  }
}
console.log(`${planned} programmes ${apply ? "curated" : "to curate"}.`);
if (!apply) console.log("Dry run. Set APPLY=1 to write.");
process.exit(0);
