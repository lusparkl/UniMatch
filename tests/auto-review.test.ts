import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  autoReview,
  completeness,
  nothingPublished,
  type CompletenessRule,
  type Published,
} from "../lib/research/auto-review";
import type { Extraction } from "../lib/research/extraction";

const url = "https://admissions.example.edu/ug";
const sources = [
  { hostname: "admissions.example.edu", allowSubdomains: false },
];
const page = [
  "BSc in Computer Science. A four-year programme taught in English.",
  "International applicants need IELTS overall 6.5.",
  "Students from all systems may also submit SAT scores of 1350 or above.",
  "Tuition fee for 2027/28 entry is HK$182,000 per annum.",
  "Application deadline: 15 January 2027 for 2027 entry.",
  "The Entrance Scholarship covers full tuition fee for all eligible students.",
  "Applicants must submit a personal statement.",
  "Further information about halls, campus life and student services is published on the university website. ".repeat(
    4,
  ),
].join("\n");
const rule = (extra: Partial<Extraction["requirements"][number]> = {}) => ({
  type: "IELTS" as const,
  label: "IELTS overall",
  minimum: 6.5,
  scale: null,
  allowed: [],
  mandatory: true,
  appliesToNationalities: [],
  appliesToQualifications: [],
  excerpt: "International applicants need IELTS overall 6.5.",
  sourceUrl: url,
  ...extra,
});
const candidate = (): Extraction => ({
  program: {
    title: "BSc in Computer Science",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Computer Science",
    teachingLanguage: "English",
    duration: "4 years",
    officialUrl: url,
    excerpt:
      "BSc in Computer Science. A four-year programme taught in English.",
    sourceUrl: url,
  },
  academicYear: "2027",
  requirements: [rule()],
  intakes: [
    {
      academicYear: "2027",
      term: "Fall",
      route: "International",
      openDate: null,
      deadline: "2027-01-15T00:00:00Z",
      timezone: null,
      excerpt: "Application deadline: 15 January 2027 for 2027 entry.",
      sourceUrl: url,
    },
  ],
  costs: [
    {
      tuition: 182000,
      living: null,
      other: null,
      currency: "HKD",
      period: "ANNUAL",
      excerpt: "Tuition fee for 2027/28 entry is HK$182,000 per annum.",
      sourceUrl: url,
    },
  ],
  documents: [
    {
      name: "Personal statement",
      mandatory: true,
      applicability: "",
      excerpt: "Applicants must submit a personal statement.",
      sourceUrl: url,
    },
  ],
  scholarships: [
    {
      name: "Entrance Scholarship",
      provider: "Example University",
      officialUrl: url,
      degreeLevels: ["BACHELOR"],
      nationalities: [],
      rules: [],
      tuitionCoverage: 1,
      stipendAmount: null,
      currency: null,
      accommodation: null,
      travel: null,
      insurance: null,
      deadline: null,
      renewalConditions: null,
      fundingCategory: "GUARANTEED",
      excerpt:
        "The Entrance Scholarship covers full tuition fee for all eligible students.",
      sourceUrl: url,
    },
  ],
  ambiguities: [],
});
const review = (
  edit: (c: Extraction) => void = () => {},
  extra: { issues?: string[]; published?: Partial<Published> } = {},
) => {
  const c = candidate();
  edit(c);
  return autoReview(c, {
    pages: new Map([[url, page]]),
    fallbackUrl: url,
    sources,
    issues: extra.issues ?? [],
    published: { ...nothingPublished, ...extra.published },
  });
};
const reasons = (r: ReturnType<typeof review>) =>
  r.rejected.map((x) => x.reason).join(" | ");

describe("auto-review rules (plan 3.1)", () => {
  it("approves a candidate whose every claim is quoted and approved", () => {
    const r = review();
    expect(r.approved).toBe(5);
    expect(r.rejected).toEqual([]);
    expect(r.conflicts).toEqual([]);
  });

  it("rule 1: rejects a quotation that is not on the page", () => {
    const r = review((c) => {
      c.requirements[0].excerpt =
        "International applicants need IELTS overall 7.0.";
      c.requirements[0].minimum = 7;
    });
    expect(r.payload.requirements).toEqual([]);
    expect(reasons(r)).toContain("not verbatim");
  });

  it("rule 1: repairs a near miss with the real passage", () => {
    const r = review((c) => {
      c.requirements[0].excerpt =
        "International applicants need the IELTS overall 6.5.";
    });
    expect(r.payload.requirements[0].excerpt).toBe(
      "International applicants need IELTS overall 6.5.",
    );
  });

  it("rule 1: refuses a repair that would drop a hedge", () => {
    const r = review((c) => {
      c.requirements = [
        rule({
          type: "SAT",
          label: "SAT",
          minimum: 1350,
          // snapExcerpt finds the real passage; only the hedge check stops it.
          excerpt:
            "Students from all systems submit SAT scores of 1350 or above.",
        }),
      ];
    });
    expect(r.payload.requirements).toEqual([]);
    expect(reasons(r)).toContain("not verbatim");
  });

  it("rule 2: rejects numbers and dates missing from their quotation", () => {
    const r = review((c) => {
      c.costs[0].tuition = 190000;
      c.intakes[0].deadline = "2027-01-16T00:00:00Z";
      c.scholarships[0].tuitionCoverage = 0.5;
    });
    expect(r.payload.costs).toEqual([]);
    expect(r.payload.intakes).toEqual([]);
    expect(r.payload.scholarships).toEqual([]);
    expect(reasons(r)).toContain("tuition 190000");
    expect(reasons(r)).toContain("deadline 2027-01-16");
    expect(reasons(r)).toContain("coverage 0.5");
  });

  it("rule 2: needs the intake year in the quotation", () => {
    const r = review((c) => {
      c.intakes[0].academicYear = "2028";
    });
    expect(reasons(r)).toContain("academic year 2028");
  });

  it("rule 3: rejects plain HTTP and unapproved hosts", () => {
    const http = review((c) => {
      c.documents[0].sourceUrl = url.replace("https", "http");
    });
    expect(http.payload.documents).toEqual([]);
    const other = review((c) => {
      c.scholarships[0].officialUrl = "https://scholarships.example.org/";
    });
    expect(other.payload.scholarships).toEqual([]);
    expect(reasons(other)).toContain("not an approved HTTPS page");
  });

  it("rule 4: records an evidence-year mismatch without rejecting", () => {
    const r = review((c) => {
      c.academicYear = "2026";
    });
    expect(r.notes.join(" ")).toContain("2026 cycle");
    expect(r.payload.intakes).toHaveLength(1);
  });

  it("rule 5: rejects a claim a Pruned: issue names", () => {
    const r = review(() => {}, {
      issues: [
        "Pruned: requirement IELTS: International applicants need IELTS overall 6.5.",
      ],
    });
    expect(r.payload.requirements).toEqual([]);
    expect(reasons(r)).toContain("Pruned:");
  });

  it("rule 6: marks a contradicted machine-reviewed row and withholds the new claim", () => {
    const r = review(() => {}, {
      published: {
        requirements: [
          {
            id: "old",
            type: "IELTS",
            label: "IELTS",
            minimum: 6,
            scope: "|",
            status: "SOURCE_BACKED",
          },
        ],
        costs: [
          {
            id: "fee",
            key: "HKD|ANNUAL",
            tuition: 170000,
            living: null,
            other: null,
            status: "SOURCE_BACKED",
          },
        ],
      },
    });
    expect(r.payload.requirements).toEqual([]);
    expect(r.payload.costs).toEqual([]);
    expect(r.conflicts.map((c) => c.id).sort()).toEqual(["fee", "old"]);
  });

  it("never replaces or demotes a human-reviewed row", () => {
    const r = review(() => {}, {
      published: {
        requirements: [
          {
            id: "human",
            type: "IELTS",
            label: "IELTS",
            minimum: 6,
            scope: "|",
            status: "ADMIN_VERIFIED",
          },
        ],
        intakes: [
          {
            id: "h2",
            key: "2027|fall|international",
            deadline: "2027-01-15T15:59:59.000Z",
            status: "ADMIN_VERIFIED",
          },
        ],
        costs: [
          {
            id: "h3",
            key: "HKD|ANNUAL",
            tuition: 182000,
            living: null,
            other: null,
            status: "ADMIN_VERIFIED",
          },
        ],
        duration: "Four years",
        teachingLanguage: null,
      },
    });
    expect(r.payload.requirements).toEqual([]);
    expect(r.payload.intakes).toEqual([]);
    expect(r.payload.costs).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(reasons(r)).toContain("human-reviewed");
    expect(r.payload.program?.duration).toBeNull();
    expect(r.payload.program?.teachingLanguage).toBe("English");
  });

  it("publishes nothing when the programme claim fails", () => {
    const r = review((c) => {
      c.program!.excerpt =
        "BSc in Data Science, a programme that does not exist here.";
    });
    expect(r.approved).toBe(0);
    expect(r.payload.costs).toEqual([]);
  });
});

describe("requirementsComplete checklist (plan 3.2)", () => {
  const english: CompletenessRule = {
    type: "IELTS",
    label: "IELTS overall",
    minimum: 6.5,
    allowed: [],
    mandatory: true,
    appliesToQualifications: [],
    appliesToNationalities: [],
    excerpt: "International applicants need IELTS overall 6.5.",
    status: "SOURCE_BACKED",
  };
  const route: CompletenessRule = {
    ...english,
    type: "QUALIFICATION",
    label: "Accepted qualifications",
    minimum: null,
    allowed: ["IB Diploma", "GCE A-Level"],
    excerpt: "We accept the IB Diploma and GCE A-Level.",
  };
  const check = (extra: Partial<Parameters<typeof completeness>[0]> = {}) =>
    completeness({
      degreeLevel: "BACHELOR",
      rules: [english, route],
      statuses: ["SOURCE_BACKED"],
      pages: [{ url, text: page }],
      byteCap: 2_000_000,
      ...extra,
    });

  it("is complete when every item holds", () =>
    expect(check()).toEqual({ complete: true, missing: [] }));
  it("needs the degree level", () =>
    expect(check({ degreeLevel: null }).complete).toBe(false));
  it("needs an English minimum or an explicit exemption", () => {
    expect(check({ rules: [route] }).missing.join()).toContain("English");
    expect(
      check({
        rules: [
          route,
          {
            ...route,
            type: "OTHER",
            allowed: [],
            excerpt:
              "English proficiency test results are not required for this route.",
          },
        ],
      }).complete,
    ).toBe(true);
  });
  it("needs an accepted-qualification list that applies to everyone", () => {
    expect(check({ rules: [english] }).complete).toBe(false);
    expect(
      check({
        rules: [english, { ...route, appliesToQualifications: ["IB Diploma"] }],
      }).missing.join(),
    ).toContain("accepted-qualification list");
  });
  it("ignores rules that are not trusted", () =>
    expect(
      check({ rules: [english, { ...route, status: "NEEDS_REVIEW" }] })
        .complete,
    ).toBe(false));
  it("needs pages read in full", () => {
    expect(check({ pages: [{ url, text: null }] }).missing.join()).toContain(
      "not stored",
    );
    expect(
      check({ pages: [{ url, text: "<script>" }] }).missing.join(),
    ).toContain("nearly empty");
    expect(check({ byteCap: 600 }).missing.join()).toContain("truncated");
  });
  it("refuses conflicting or outdated rows", () =>
    expect(check({ statuses: ["SOURCE_BACKED", "OUTDATED"] }).complete).toBe(
      false,
    ));
});

describe("reviewer script", () => {
  it("refuses to record owner approval", () => {
    let message = "";
    try {
      execFileSync("npx", ["tsx", "scripts/auto-review.ts"], {
        env: { ...process.env, OWNER_APPROVED: "1" },
        stdio: "pipe",
      });
    } catch (error) {
      message = String((error as { stderr?: Buffer }).stderr);
    }
    expect(message).toContain("never records owner approval");
  }, 30000);
});
