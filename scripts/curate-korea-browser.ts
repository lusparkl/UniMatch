import { db } from "../lib/db";
import { extractionSchema, type Extraction } from "../lib/research/extraction";
import { reviewCandidate } from "../lib/research/review";
import { curationJob, latestDocument, quoter } from "./curation";
// W5 continued: Yonsei UIC, GIST and SKKU, quoted from the owner-requested browser copies stored by
// scripts/import-browser.ts (2026-11-10). Same rules as scripts/curate-korea.ts: only what the pages state;
// eligibility on parents' citizenship and English reports without a minimum are OTHER rules (UNKNOWN); no
// accepted-qualification list is published, so nothing is marked requirementsComplete. Tuition is stored per
// semester where the page says so (UIC 2026, GIST 2027); SKKU's tuition table names no period and is not stored.
// GIST's tuition waiver is "Granted to all international students without any conditions": GUARANTEED, listed
// in docs/OWNER_CONFIRM.md at commit 9a198b0. Programmes that already have rules are skipped. SOURCE_BACKED. APPLY=1 writes.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (UIC, GIST and SKKU pages opened in a browser at the owner's request on 2026-11-10)";
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
const docs = new Map<
  string,
  NonNullable<Awaited<ReturnType<typeof latestDocument>>>
>();
async function q(universityId: string, url: string) {
  if (!docs.has(url)) {
    const doc = await latestDocument(universityId, url);
    if (!doc)
      throw new Error("Not stored (run scripts/import-browser.ts): " + url);
    docs.set(url, doc);
  }
  return quoter(url, docs.get(url)!.text);
}

// --- Yonsei UIC ---
const uic = (mid: string, page = "admission") =>
  `https://uic.yonsei.ac.kr/${page}.php?mid=${mid}`;
async function uicFacts(): Promise<Record<string, Part>> {
  const a = await q("yonsei-uic", uic("m04_02_02"));
  const t = await q("yonsei-uic", uic("m04_03"));
  return {
    "2027": {
      requirements: [
        rule(
          "Eligibility: a high school diploma or equivalent before matriculation (GED, home or cyber schooling not accepted), and the student and both parents are non-Korean",
          a(
            "1. Students must either hold or expect to hold a high school diploma",
            "does not satisfy the minimum criteria for eligibility. 2. The student must be a non-Korean with non-Korean parents",
          ),
        ),
        rule(
          "English proficiency proof required from the 2027 intake (TOEFL, IELTS, CEFR, IB DP English A or AP English; no minimum scores), or a diploma from a school in an English-only-official-language country, or a Medium of Instruction certificate",
          a(
            "Required to submit documents proving English proficiency or equivalents",
            "a Medium of Instruction certificate.",
          ),
        ),
      ],
      intakes: [
        {
          academicYear: "2027",
          term: "Spring",
          route: "International Students Track: 1st Round",
          openDate: "2026-08-26T10:00:00+09:00",
          deadline: "2026-09-22T17:00:00+09:00",
          timezone: null,
          ...a(
            "Admission Round1st Round2nd Round (TBD)",
            "5PM on Sept. 22, 2026",
          ),
        },
        {
          academicYear: "2027",
          term: "Fall",
          route:
            "International Students Track: 2nd Round (online application March 2027; dates to be determined)",
          openDate: null,
          deadline: null,
          timezone: null,
          ...a("Admission Round1st Round2nd Round (TBD)", "March, 2027"),
        },
      ],
      costs: [],
      scholarships: [
        scholarship({
          name: "UIC Admissions Scholarship",
          provider: "Underwood International College, Yonsei University",
          officialUrl: uic("m04_03"),
          // Selected from admitted applicants according to academic credentials.
          fundingCategory: "COMPETITIVE",
          tuitionCoverage: 1,
          renewalConditions:
            "Recipients must maintain a certain level of GPA each semester",
          ...t(
            "Admissions Scholarship Qualification: Newly-admitted international students to UIC",
            "to stay eligible for the scholarship in the following semester.",
          ),
        }),
      ],
    },
    "2026": {
      requirements: [],
      intakes: [],
      scholarships: [],
      costs: [
        {
          tuition: 8202000,
          living: null,
          other: 56000,
          currency: "KRW",
          period: "SEMESTER",
          ...t(
            "Below is the table of fees for one semester of the 2026 academic year.",
            "[Per semester]",
          ),
        },
      ],
    },
  };
}

// --- GIST ---
const gistGuide =
  "https://www.gist.ac.kr/iuadm/img/sub02/2027_Fall_Undergraduate_Admission_Guideline_Final.pdf";
async function gistFacts(): Promise<Record<string, Part>> {
  const g = await q("gist", gistGuide);
  return {
    "2027": {
      requirements: [
        rule(
          "Eligibility: high school graduation by July 31st, 2027, and either neither parent is a Korean citizen or (Korean origin) all of elementary, middle and high school completed outside Korea; Korean or dual Korean citizens are not eligible",
          g(
            "Applicants who have graduated from high school by July 31st, 2027.",
            "are not eligible to apply as international students.",
          ),
        ),
        rule(
          "Official English proficiency test score report (TOEFL, IELTS, TEPS, TOEIC, Cambridge, PTE Academic or Duolingo; no minimum score is stated); native English speakers (USA, Canada, UK, Ireland, Australia, New Zealand) are exempt",
          g(
            "• TOEFL (Code: 0144), IELTS, TEPS, TOEIC",
            "do not need to submit English proficiency test score report.",
          ),
        ),
        rule(
          "At least one standardized test report (SAT, ACT, GCE A-Level, IB, AP, International Olympiad, or the country's high school graduation or college entrance exam)",
          g(
            "• SAT, ACT, GCE A-Level, IB, AP, and Certificate of International Olympiad",
            "At least one of the above official test score reports should be submitted.",
          ),
        ),
      ],
      intakes: [
        {
          academicYear: "2027",
          term: "Fall",
          route: "International undergraduate admission",
          openDate: "2026-12-01T00:00:00Z",
          deadline: "2027-01-29T00:00:00Z",
          timezone: null,
          ...g("Online Application Dec 1st (Tue), 2026 ~ Jan 29th (Fri), 2027"),
        },
      ],
      costs: [
        {
          tuition: 4050000,
          living: null,
          other: null,
          currency: "KRW",
          period: "SEMESTER",
          ...g("Tuition fee Fully waived", "(₩4,050,000/semester)"),
        },
      ],
      scholarships: [
        scholarship({
          name: "GIST tuition waiver (international students)",
          provider: "GIST",
          officialUrl: gistGuide,
          fundingCategory: "GUARANTEED",
          tuitionCoverage: 1,
          renewalConditions:
            "Tuition fees and allowances are supported for 8 semesters; allowances have their own credit and GPA conditions",
          ...g(
            "Tuition fee Fully waived",
            "Granted to all international students without any conditions",
          ),
        }),
      ],
    },
  };
}

// --- SKKU ---
const skkuGuide =
  "https://admission-global.skku.edu/common/download.php?fpath=board/20261104163812E4JXRE.pdf&fname=%5BEN%5D+Undergraduate+Freshmen+Admission+Guide_2027+Spring.pdf";
async function skkuFacts(fall: boolean): Promise<Record<string, Part>> {
  const g = await q("skku", skkuGuide);
  const schedule = g(
    "5. Admission Schedule Category 1st Round 2nd Round",
    "Beginning of Semester Mar. 1(Mon), 2027",
  );
  return {
    "2027": {
      requirements: [
        rule(
          "Eligibility: non-Korean students whose parents are both non-Koreans (as of the application date)",
          g("Non-Korean students whose parents are both non-Koreans"),
        ),
        rule(
          "English Track: official English test score report (TOEFL iBT, IELTS, TEPS, TOEIC, etc.; no admission minimum is stated); nationals of, or graduates from, a country with English as a native or official language are exempt",
          g(
            "English Track • Original official English proficiency test(TOEFL iBT, IELTS, TEPS, TOEIC, etc.) score report",
            "are exempt from submitting the above-mentioned official English proficiency test scores",
          ),
        ),
        rule(
          "To be placed in the major before the second year: IELTS 6.5 or TOEFL iBT 4.5 (80 for tests before Jan 21, 2026)",
          g(
            "- English Track : IELTS 6.5 or TOEFL iBT 4.5",
            "before being promoted to sophomore year.",
          ),
          { mandatory: false },
        ),
      ],
      intakes: [
        {
          academicYear: "2027",
          term: "Spring",
          route: "International undergraduate admission: 1st Round",
          openDate: "2026-08-12T10:00:00+09:00",
          deadline: "2026-08-21T17:00:00+09:00",
          timezone: null,
          ...schedule,
        },
        {
          academicYear: "2027",
          term: "Spring",
          route: "International undergraduate admission: 2nd Round",
          openDate: "2026-11-04T10:00:00+09:00",
          deadline: "2026-11-13T17:00:00+09:00",
          timezone: null,
          ...schedule,
        },
        ...(fall
          ? [
              {
                academicYear: "2027",
                term: "Fall",
                route:
                  "International undergraduate admission (Fall dates not yet published)",
                openDate: null,
                deadline: null,
                timezone: null,
                ...g(
                  "Admission Units of English Track",
                  "Computer Science and Engineering O O",
                ),
              },
            ]
          : []),
      ],
      costs: [],
      scholarships: [],
    },
  };
}

const entries: {
  universityId: string;
  title: string;
  fieldOfStudy: string;
  officialUrl: string;
  quote: [string, string?];
  facts: () => Promise<Record<string, Part>>;
}[] = [
  ...(
    [
      [
        "Economics (ECON)",
        "Economics",
        "m02_01_02",
        "Underwood Division (UD) Economics (ECON)",
      ],
      [
        "International Studies (IS)",
        "International Studies",
        "m02_01_03",
        "Underwood Division (UD) International Studies (IS)",
      ],
      [
        "Political Science and International Relations (PSIR)",
        "Political Science",
        "m02_01_04",
        "Underwood Division (UD) Political Science and International Relations (PSIR)",
      ],
      [
        "Quantitative Risk Management (QRM)",
        "Quantitative Risk Management",
        "m02_02_06",
        "Quantitative Risk Management (QRM)",
      ],
      [
        "Information and Interaction Design (IID)",
        "Interaction Design",
        "m02_02_03",
        "Information and Interaction Design (IID)",
      ],
      [
        "Nano Science and Engineering (NSE)",
        "Nano Science and Engineering",
        "m02_03_01",
        "Nano Science and Engineering (NSE)",
      ],
    ] as const
  ).map(([title, fieldOfStudy, mid, quote]) => ({
    universityId: "yonsei-uic",
    title,
    fieldOfStudy,
    officialUrl: uic(mid, "undergraduate"),
    quote: [quote] as [string],
    facts: uicFacts,
  })),
  ...(
    [
      [
        "BS in Artificial Intelligence",
        "Artificial Intelligence",
        "College of Artificial Intelligence AI",
      ],
      [
        "BS in Electrical Engineering and Computer Science",
        "Computer Science",
        "Electrical Engineering and Computer Science",
      ],
      [
        "BS in Physics and Photon Science",
        "Physics",
        "Physics and Photon Science",
      ],
      ["BS in Mathematical Sciences", "Mathematics", "Mathematical Sciences"],
      [
        "BS in Mechanical and Robotics Engineering",
        "Mechanical Engineering",
        "Mechanical and Robotics Engineering",
      ],
      [
        "BS in Materials Science and Engineering",
        "Materials Science",
        "Materials Science and Engineering",
      ],
    ] as const
  ).map(([title, fieldOfStudy, quote]) => ({
    universityId: "gist",
    title,
    fieldOfStudy,
    officialUrl: gistGuide,
    quote: [quote] as [string],
    facts: gistFacts,
  })),
  ...(
    [
      [
        "Global Economics (English Track)",
        "Economics",
        "Global Economics O X",
        false,
      ],
      [
        "Global Business Administration (English Track)",
        "Business Administration",
        "Global Business Administration O X",
        false,
      ],
      [
        "Computer Science and Engineering (English Track)",
        "Computer Science",
        "Computer Science and Engineering O O",
        true,
      ],
      [
        "Biomedical Engineering (English Track)",
        "Biomedical Engineering",
        "Biomedical Engineering O X",
        false,
      ],
      [
        "Mechanical Engineering (English Track)",
        "Mechanical Engineering",
        "Mechanical Engineering O",
        false,
      ],
    ] as const
  ).map(([title, fieldOfStudy, quote, fall]) => ({
    universityId: "skku",
    title,
    fieldOfStudy,
    officialUrl: skkuGuide,
    quote: ["Admission Units of English Track", quote] as [string, string],
    facts: () => skkuFacts(fall),
  })),
];
const jobs = new Map<string, string>();
let planned = 0;
for (const entry of entries) {
  const existing = await db.degreeProgram.findUnique({
    where: {
      universityId_title_degreeLevel: {
        universityId: entry.universityId,
        title: entry.title,
        degreeLevel: "BACHELOR",
      },
    },
    include: { requirements: true },
  });
  if (existing?.requirements.length) {
    console.log("   skip (already curated):", entry.title);
    continue;
  }
  const own = (await q(entry.universityId, entry.officialUrl))(...entry.quote);
  const byYear = await entry.facts();
  console.log(
    `   ${entry.universityId} | ${entry.title}: ${Object.keys(byYear).length} candidate(s); "${own.excerpt.slice(0, 60)}"`,
  );
  planned++;
  if (!apply) continue;
  if (!jobs.has(entry.universityId))
    jobs.set(
      entry.universityId,
      (await curationJob(entry.universityId, "Browser copies 2026-11-10")).id,
    );
  for (const [year, part] of Object.entries(byYear)) {
    const payload = extractionSchema.parse({
      program: {
        title: entry.title,
        degreeLevel: "BACHELOR",
        fieldOfStudy: entry.fieldOfStudy,
        teachingLanguage: entry.universityId === "skku" ? "English" : null,
        duration: null,
        officialUrl: entry.officialUrl,
        ...own,
      },
      academicYear: year,
      ...part,
      documents: [],
      ambiguities: [],
    });
    const candidate = await db.extractionCandidate.create({
      data: {
        jobId: jobs.get(entry.universityId)!,
        documentId: docs.get(entry.officialUrl)!.id,
        programId: existing?.id,
        payload,
        issues: [],
      },
    });
    await reviewCandidate(candidate.id, "APPROVE", reviewer, payload, false, {
      status: "SOURCE_BACKED",
    });
    // The first approval creates the programme; link its candidate to it as the pipeline does.
    const program = await db.degreeProgram.findUniqueOrThrow({
      where: {
        universityId_title_degreeLevel: {
          universityId: entry.universityId,
          title: entry.title,
          degreeLevel: "BACHELOR",
        },
      },
    });
    await db.extractionCandidate.update({
      where: { id: candidate.id },
      data: { programId: program.id },
    });
  }
}
console.log(`${planned} programmes ${apply ? "curated" : "to curate"}.`);
if (!apply) console.log("Dry run. Set APPLY=1 to write.");
process.exit(0);
