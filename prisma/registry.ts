import { db } from "../lib/db";
import discovered from "./registry-programs.json";
import korea from "./registry-programs-kr.json";
// Program registry: a human-chosen list of real degrees and the official pages that state their
// admission, fee and deadline facts. Extraction runs once per registered program over these pages.
type Entry = {
  universityId: string;
  title: string;
  degreeLevel: "BACHELOR" | "MASTER";
  fieldOfStudy: string;
  officialUrl: string;
};
// First-year bachelor's programmes open to international applicants, read from each university's
// official programme list on 2026-10-31. `requirementFilter` is HKUST's program_requirement id.
const listed = discovered as (Entry & { requirementFilter?: string })[];
const curatedPrograms: Entry[] = [
  {
    universityId: "hkust",
    title: "BEng/BSc in Computer Science",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Computer Science",
    officialUrl:
      "https://join.hkust.edu.hk/our-programs/school-of-engineering/computer-science",
  },
  {
    universityId: "hkust",
    title: "BEng in Computer Engineering",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Computer Engineering",
    officialUrl:
      "https://join.hkust.edu.hk/our-programs/school-of-engineering/computer-engineering",
  },
  {
    universityId: "hkust",
    title: "BEng in Electronic Engineering",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Electronic Engineering",
    officialUrl:
      "https://join.hkust.edu.hk/our-programs/school-of-engineering/electronic-engineering",
  },
  {
    universityId: "hkust",
    title: "BEng in Artificial Intelligence",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Artificial Intelligence",
    officialUrl:
      "https://join.hkust.edu.hk/our-programs/school-of-engineering/artificial-intelligence",
  },
  {
    universityId: "hku",
    title: "Bachelor of Engineering in Computer Science",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Computer Science",
    officialUrl:
      "https://www.cds.hku.hk/prospective-students/undergraduate-old-2026/6999-computing-and-data-science/",
  },
  {
    universityId: "hku",
    title:
      "Bachelor of Engineering in Artificial Intelligence and Data Science",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Artificial Intelligence and Data Science",
    officialUrl:
      "https://www.cds.hku.hk/prospective-students/undergraduate-old-2026/6999-computing-and-data-science/",
  },
  {
    universityId: "polyu",
    title:
      "Computing and AI (Computer Science / Enterprise Information Systems) - BSc (Hons) Scheme",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Computer Science",
    officialUrl: "https://www.polyu.edu.hk/study/ug/jupas/2027/js3868",
  },
  {
    universityId: "cuhk",
    title: "Computer Science and Engineering",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Computer Science and Engineering",
    officialUrl: "https://admission.cuhk.edu.hk/programme/bcsen/",
  },
  {
    universityId: "cuhk",
    title: "Artificial Intelligence: Systems and Technologies",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Artificial Intelligence",
    officialUrl: "https://admission.cuhk.edu.hk/programme/aistn/",
  },
  {
    universityId: "cuhk",
    title: "Computational Data Science",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Data Science",
    officialUrl: "https://admission.cuhk.edu.hk/programme/cdasn/",
  },
  {
    universityId: "cuhk",
    title: "Information Engineering",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Information Engineering",
    officialUrl: "https://admission.cuhk.edu.hk/programme/iergn/",
  },
  {
    universityId: "hkbu",
    title: "Bachelor of Science (Hons)",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Computer Science (one of the science majors)",
    officialUrl:
      "https://admissions.hkbu.edu.hk/programmes/faculty-of-science/bachelor-of-science-hons-year1.html",
  },
];
// Hand-registered entries win over listed ones with the same official page (they keep their titles).
const curatedUrls = new Set(curatedPrograms.map((p) => p.officialUrl));
const added = listed.filter((p) => !curatedUrls.has(p.officialUrl));
// South Korea (W5, 2026-11-10): institutions with an English-taught first-year route for international
// applicants whose official pages are crawlable. KAIST, POSTECH and UNIST admit to an undeclared major;
// the registered majors are the ones their admission pages list. Skipped: Yonsei UIC, GIST and SKKU
// (robots.txt disallows the admission pages), DGIST (connections reset or timed out), Hanyang (HTTP 403),
// SNU (no English-taught route page reached).
export const universities = [
  {
    id: "kaist",
    name: "KAIST (Korea Advanced Institute of Science and Technology)",
    city: "Daejeon",
    officialWebsite: "https://www.kaist.ac.kr/en/",
  },
  {
    id: "postech",
    name: "POSTECH (Pohang University of Science and Technology)",
    city: "Pohang",
    officialWebsite: "https://www.postech.ac.kr/eng/",
  },
  {
    id: "unist",
    name: "UNIST (Ulsan National Institute of Science and Technology)",
    city: "Ulsan",
    officialWebsite: "https://www.unist.ac.kr/",
  },
  {
    id: "korea",
    name: "Korea University",
    city: "Seoul",
    officialWebsite: "https://www.korea.edu/",
  },
].map((u) => ({ ...u, country: "South Korea" }));
export const programs: Entry[] = [
  ...curatedPrograms,
  ...(korea as Entry[]),
  ...added.map((p) => ({
    universityId: p.universityId,
    title: p.title,
    degreeLevel: p.degreeLevel,
    fieldOfStudy: p.fieldOfStudy,
    officialUrl: p.officialUrl,
  })),
];
// Institution-level pages for non-local applicants: international qualifications, fees, scholarships.
// HKUST renders its requirement tables server-side when all three filter parameters are present.
// The parameter order below is already the sorted canonical form.
const hkustFilter = (general: string, language = "All", program = "All") =>
  `https://join.hkust.edu.hk/admissions/international-qualifications?general_requirement=${general}&language_requirement=${language}&program_requirement=${program}`;
// `program` scopes a page to one or more registered programs; unscoped pages serve every program of the university.
// `fees: "per-program"` marks a fee page whose tuition differs between programs: every program call reads it.
export const pages: {
  universityId: string;
  url: string;
  program?: string | string[];
  fees?: "per-program";
  // Script-rendered pages: the approved source allows browser rendering when the HTML is nearly empty.
  render?: true;
}[] = [
  ...[
    "https://join.hkust.edu.hk/admissions/international-qualifications",
    "https://join.hkust.edu.hk/fees-and-scholarships",
    "https://seng.hkust.edu.hk/academics/undergraduate/faq-info-for-non-jupas-and-non-local-students",
    "https://join.hkust.edu.hk/admissions",
  ].map((url) => ({ universityId: "hkust", url })),
  // One curriculum plus one English test per page: IB/IELTS, A-level/TOEFL, SAT-AP/Duolingo, Canada/PTE, Australia, India.
  ...[
    ["46205", "46244"],
    ["46185", "46245"],
    ["46180", "46747"],
    ["46188", "46748"],
    ["46181", "All"],
    ["46203", "All"],
  ].map(([general, language]) => ({
    universityId: "hkust",
    url: hkustFilter(general, language),
  })),
  // Subject requirements of each registered program.
  ...[
    ["46308", "BEng/BSc in Computer Science"],
    ["46307", "BEng in Computer Engineering"],
    ["46310", "BEng in Electronic Engineering"],
    ["46313", "BEng in Artificial Intelligence"],
    ...added
      .filter((p) => p.requirementFilter)
      .map((p) => [p.requirementFilter!, p.title]),
  ].map(([id, program]) => ({
    universityId: "hkust",
    url: hkustFilter("All", "All", id),
    program,
  })),
  ...[
    "https://www.admissions.hku.hk/apply/international-qualifications",
    "https://www.admissions.hku.hk/fees-and-scholarships/scholarships",
    "https://admissions.hku.hk/apply/international-qualifications/english-language-requirement",
  ].map((url) => ({ universityId: "hku", url })),
  // Tuition differs by faculty: STEM, non-STEM, and MBBS/BDS.
  {
    universityId: "hku",
    url: "https://www.admissions.hku.hk/fees-and-scholarships/fees",
    fees: "per-program",
  },
  // Admission page of programme 6999, the scheme both registered HKU computing degrees belong to.
  {
    universityId: "hku",
    url: "https://admissions.hku.hk/programmes/undergraduate-programmes/computing-and-data-science",
    program: [
      "Bachelor of Engineering in Computer Science",
      "Bachelor of Engineering in Artificial Intelligence and Data Science",
    ],
  },
  ...[
    "https://admission.cuhk.edu.hk/application/overseas-other-qualifications-non-local-international-team/requirements/",
    "https://admission.cuhk.edu.hk/application/overseas-other-qualifications-non-local-international-team/important-dates/",
    "https://admission.cuhk.edu.hk/fees-financing-your-studies/fees/",
    "https://admission.cuhk.edu.hk/fees-financing-your-studies/scholarships/",
    "https://admission.cuhk.edu.hk/application/overseas-other-qualifications-non-local-international-team/faq/",
    // IB guide for 2027 entry (linked from the requirements page): IB Chinese condition and subject preferences.
    "https://www.cuhk.edu.hk/adm/intl/adm_guide/IB.pdf",
  ].map((url) => ({ universityId: "cuhk", url })),
  ...[
    "https://admissions.hkbu.edu.hk/admissions/international-qualifications.html",
    "https://admissions.hkbu.edu.hk/fees-and-scholarships.html",
  ].map((url) => ({ universityId: "hkbu", url })),
  ...[
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications",
    "https://www.polyu.edu.hk/study/ug/fees-and-scholarships/fees",
    "https://www.polyu.edu.hk/study/ug/fees-and-scholarships/scholarships",
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-frequently",
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-general",
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-english",
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-preferred",
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-key-dates",
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-additional",
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-tuition-fees",
    "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-other-fees-and",
  ].map((url) => ({ universityId: "polyu", url })),
  ...[
    "https://admission.kaist.ac.kr/intl-undergraduate/before/sub01",
    "https://admission.kaist.ac.kr/intl-undergraduate/before/sub02",
    "https://admission.kaist.ac.kr/intl-undergraduate/application/ApplicationGuide/ApplicationTimeline",
    "https://admission.kaist.ac.kr/intl-undergraduate/support/coa",
    "https://admission.kaist.ac.kr/intl-undergraduate/support/scholarships/kaist",
  ].map((url) => ({ universityId: "kaist", url, render: true as const })),
  ...[
    "https://adm-iu.postech.ac.kr/user/comm/menu/3317587a17a23d4dacdb9ffc4762bf4a/content/index.do",
    "https://adm-iu.postech.ac.kr/user/comm/menu/b7f8c54d6eaff431c253db1c8b9bcb45/content/index.do",
    "https://adm-iu.postech.ac.kr/user/comm/menu/e2afb97fa1b8f43c574be0dabef78f87/content/index.do",
  ].map((url) => ({ universityId: "postech", url })),
  ...[
    "https://admu-intl.unist.ac.kr/admission-eng/admissions/admissions.do?articleNo=306812&attachNo=591437&mode=download",
    "https://admu-intl.unist.ac.kr/admission-eng/life/scholarships.do",
  ].map((url) => ({ universityId: "unist", url })),
  ...[
    "https://oia.korea.ac.kr/_attach/file/2026/08/lpZzpFXiuEfpfIZPBrYB.pdf",
    "https://oia.korea.ac.kr/oia2026/Tuition.do",
    "https://oia.korea.ac.kr/oia2026/KU-Scholarships.do",
  ].map((url) => ({ universityId: "korea", url })),
];
// Stand-ins that duplicate a registered degree.
// Also junk rows (a master's scholarship page, a business scheme) that no registry entry covers.
const retired: {
  universityId: string;
  title: string;
  degreeLevel: "BACHELOR" | "MASTER";
}[] = [
  {
    universityId: "hkust",
    title: "Computer Science and Engineering",
    degreeLevel: "BACHELOR",
  },
  {
    universityId: "hku",
    title: "Computer Science (BEng)",
    degreeLevel: "BACHELOR",
  },
  { universityId: "hkust", title: "Engineering MSc", degreeLevel: "MASTER" },
  {
    universityId: "polyu",
    title:
      "Accounting and Finance (Accountancy / Accounting and Finance / Digital Finance and Investment) - BBA (Hons) Scheme - Bachelor of Business Administration (Honours) Scheme",
    degreeLevel: "BACHELOR",
  },
];
// CUHK programmes open only for senior-year (second-year) entry; checked 2026-11-01.
const seniorYearOnly = [
  "bmbln",
  "histn-puh",
  "chedn",
  "eshen",
  "cengn",
  "cscin",
  "chprn",
  "bscgb",
  "nscin",
  "gdrsn",
  "socin-ssd",
].map((code) => `https://admission.cuhk.edu.hk/programme/${code}/`);
// Transfer-student pages: wrong audience for first-year international applicants.
const demoted = ["https://join.hkust.edu.hk/admissions/post-secondary"];
export async function seedRegistry() {
  for (const { id, ...u } of universities)
    await db.university.upsert({
      where: { id },
      create: { id, ...u },
      update: { country: u.country, city: u.city },
    });
  for (const p of programs) {
    await db.degreeProgram.upsert({
      where: {
        universityId_title_degreeLevel: {
          universityId: p.universityId,
          title: p.title,
          degreeLevel: p.degreeLevel,
        },
      },
      create: { ...p, published: true, requirementsComplete: false },
      update: { officialUrl: p.officialUrl, published: true },
    });
  }
  const urls = [
    ...programs.map((p) => ({
      universityId: p.universityId,
      url: p.officialUrl,
    })),
    ...pages,
  ].map((u) => ({
    ...u,
    program: "program" in u ? u.program : undefined,
    fees: "fees" in u ? u.fees : undefined,
    render: "render" in u ? u.render : undefined,
  }));
  for (const { universityId, url, program, fees, render } of urls) {
    // Several scoped titles are stored one per line.
    const purpose = program
      ? "registry:" + [program].flat().join("\n")
      : fees
        ? "registry-fees"
        : "registry";
    await db.approvedSource.upsert({
      where: { universityId_startUrl: { universityId, startUrl: url } },
      create: {
        universityId,
        startUrl: url,
        hostname: new URL(url).hostname,
        purpose,
        allowSubdomains: false,
        browserRendering: !!render,
      },
      update: { purpose, ...(render ? { browserRendering: true } : {}) },
    });
  }
  // Registry sources dropped from this list stop feeding the pipeline.
  for (const universityId of new Set(urls.map((u) => u.universityId)))
    await db.approvedSource.deleteMany({
      where: {
        universityId,
        purpose: { startsWith: "registry" },
        startUrl: {
          notIn: urls
            .filter((u) => u.universityId === universityId)
            .map((u) => u.url),
        },
      },
    });
  // www.cuhk.edu.hk/english/admissions/* serves unrelated search-spam pages; the real site is admission.cuhk.edu.hk.
  await db.approvedSource.deleteMany({
    where: {
      universityId: "cuhk",
      startUrl: { startsWith: "https://www.cuhk.edu.hk/english/admissions/" },
    },
  });
  for (const r of retired)
    await db.degreeProgram.updateMany({
      where: r,
      data: { published: false },
    });
  await db.degreeProgram.updateMany({
    where: { universityId: "cuhk", officialUrl: { in: seniorYearOnly } },
    data: { published: false },
  });
  await db.approvedSource.updateMany({
    where: { startUrl: { in: demoted }, purpose: "registry" },
    data: { purpose: "admissions" },
  });
}
