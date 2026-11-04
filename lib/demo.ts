import { type Program, type Requirement } from "./domain";
const rule = (
  type: Requirement["type"],
  label: string,
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
  status: "ADMIN_VERIFIED",
  ...extra,
});
// Five fictional institutions in the enabled destinations; each index exercises a different case
// (guaranteed award, missing deadline, full-cost funding, conflicting evidence, nationality restriction).
const fixtures = [
  ["Northstar University", "Hong Kong", "Lakewood"],
  ["Harbour Institute", "South Korea", "Harbour City"],
  ["Riverbend Technical University", "Hong Kong", "Riverbend"],
  ["Linden Institute of Technology", "South Korea", "Lindenstadt"],
  ["Meridian University", "Hong Kong", "Meridian"],
] as const;
export const demoPrograms: Program[] = fixtures.flatMap(
  ([name, country, city], i) =>
    [0, 1].map((j) => {
      const master = j === 1,
        full = i === 2,
        conflict = i === 3;
      return {
        id: "demo-" + i + "-" + j,
        universityId: "demo-" + i,
        university: name + " (fictional)",
        country,
        city,
        title: master ? "MSc in Computer Science" : "BSc in Computer Science",
        degreeLevel: master ? "MASTER" : "BACHELOR",
        fieldOfStudy: "Computer Science",
        teachingLanguage: "English",
        officialUrl: "",
        demo: true,
        requirementsComplete: !conflict,
        requirements: [
          rule("IELTS", "English language proficiency", {
            minimum: i === 4 ? 8 : 6.5,
            status: conflict ? "CONFLICTING" : "ADMIN_VERIFIED",
          }),
          ...(master
            ? [
                rule("BACHELOR_FIELD", "Previous bachelor's field", {
                  allowed: ["Computer Science", "Engineering"],
                }),
              ]
            : []),
          ...(i === 4
            ? [
                rule("NATIONALITY", "Demo nationality restriction", {
                  allowed: ["South Korea"],
                }),
              ]
            : []),
        ],
        intakes:
          i === 1
            ? []
            : [
                {
                  academicYear: "2027",
                  term: "Fall",
                  route: "International application",
                  openDate: null,
                  deadline: "2027-05-01T23:59:00Z",
                  timezone: "UTC",
                  status: "ADMIN_VERIFIED",
                },
              ],
        costs: [
          {
            tuition: 18000 + i * 2000,
            living: 12000,
            other: 1000,
            currency: "USD",
            period: "ANNUAL",
            status: "ADMIN_VERIFIED",
          },
        ],
        scholarships: [
          {
            id: "demo-scholarship-" + i,
            name: full
              ? "Fictional full-cost fellowship"
              : "Fictional tuition scholarship",
            rules: [
              rule("IELTS", "Scholarship language threshold", { minimum: 7 }),
            ],
            tuitionCoverage: 1,
            stipendAmount: full ? 13000 : 0,
            currency: "USD",
            fundingCategory: i === 0 ? "GUARANTEED" : "COMPETITIVE",
            status: "ADMIN_VERIFIED",
            deadline: "2027-04-01T23:59:00Z",
            renewalConditions: "Fictional annual academic review",
          },
        ],
        documents: [
          { name: "Academic transcript", mandatory: true },
          { name: "English test result", mandatory: true },
        ],
        lastResearched: "2026-10-27T00:00:00Z",
      } satisfies Program;
    }),
);
