import { countries, type Program, type Requirement } from "./domain";
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
export const demoPrograms: Program[] = countries.flatMap((country, i) =>
  [0, 1].map((j) => {
    const names = [
      "Northstar University",
      "Harbour Institute",
      "Danube Technical University",
      "Linden Institute of Technology",
      "Meridian University",
    ];
    const master = j === 1,
      full = i === 2,
      conflict = i === 3;
    return {
      id: "demo-" + i + "-" + j,
      universityId: "demo-" + i,
      university: names[i] + " (fictional)",
      country,
      city: [
        "Lakewood",
        "Harbour City",
        "Riverbend",
        "Lindenstadt",
        "Meridian",
      ][i],
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
                allowed: ["Singapore"],
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
