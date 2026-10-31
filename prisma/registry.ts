import { db } from "../lib/db";
// Program registry: a human-chosen list of real degrees and the official pages that state their
// admission, fee and deadline facts. Extraction runs once per registered program over these pages.
type Entry = {
  universityId: string;
  title: string;
  degreeLevel: "BACHELOR" | "MASTER";
  fieldOfStudy: string;
  officialUrl: string;
};
export const programs: Entry[] = [
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
// Institution-level pages for non-local applicants: international qualifications, fees, scholarships.
// HKUST renders its requirement tables server-side when all three filter parameters are present.
// The parameter order below is already the sorted canonical form.
const hkustFilter = (general: string, language = "All", program = "All") =>
  `https://join.hkust.edu.hk/admissions/international-qualifications?general_requirement=${general}&language_requirement=${language}&program_requirement=${program}`;
// `program` scopes a page to one registered program; unscoped pages serve every program of the university.
export const pages: { universityId: string; url: string; program?: string }[] =
  [
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
    ].map(([id, program]) => ({
      universityId: "hkust",
      url: hkustFilter("All", "All", id),
      program,
    })),
    ...[
      "https://www.admissions.hku.hk/apply/international-qualifications",
      "https://www.admissions.hku.hk/fees-and-scholarships/fees",
      "https://www.admissions.hku.hk/fees-and-scholarships/scholarships",
    ].map((url) => ({ universityId: "hku", url })),
    ...[
      "https://admission.cuhk.edu.hk/application/overseas-other-qualifications-non-local-international-team/requirements/",
      "https://admission.cuhk.edu.hk/application/overseas-other-qualifications-non-local-international-team/important-dates/",
      "https://admission.cuhk.edu.hk/fees-financing-your-studies/fees/",
      "https://admission.cuhk.edu.hk/fees-financing-your-studies/scholarships/",
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
    ].map((url) => ({ universityId: "polyu", url })),
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
];
// Transfer-student pages: wrong audience for first-year international applicants.
const demoted = ["https://join.hkust.edu.hk/admissions/post-secondary"];
export async function seedRegistry() {
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
  ].map((u) => ({ ...u, program: "program" in u ? u.program : undefined }));
  for (const { universityId, url, program } of urls) {
    const purpose = program ? "registry:" + program : "registry";
    await db.approvedSource.upsert({
      where: { universityId_startUrl: { universityId, startUrl: url } },
      create: {
        universityId,
        startUrl: url,
        hostname: new URL(url).hostname,
        purpose,
        allowSubdomains: false,
      },
      update: { purpose },
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
  await db.approvedSource.updateMany({
    where: { startUrl: { in: demoted }, purpose: "registry" },
    data: { purpose: "admissions" },
  });
  // Business schemes are outside the registry scope (computing and engineering only).
  await db.degreeProgram.updateMany({
    where: {
      universityId: "polyu",
      title: { startsWith: "Accounting and Finance" },
    },
    data: { published: false },
  });
}
