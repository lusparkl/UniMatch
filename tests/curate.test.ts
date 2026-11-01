import { describe, expect, it } from "vitest";
import { curate, labelWindow, quotedOverall } from "../lib/research/curate";
import type { Extraction } from "../lib/research/extraction";

const base = (over: Partial<Extraction> = {}): Extraction => ({
  program: {
    title: "BEng in Test",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Test",
    teachingLanguage: null,
    duration: "4Y",
    officialUrl: "https://u.example/p",
    excerpt: "BEng in Test programme",
    sourceUrl: "https://u.example/p",
  },
  academicYear: "2027",
  requirements: [],
  intakes: [],
  costs: [],
  documents: [],
  scholarships: [],
  ambiguities: [],
  ...over,
});
const rule = (over: Record<string, unknown>) => ({
  type: "IELTS",
  label: "English proof",
  minimum: 6,
  scale: null,
  allowed: [],
  mandatory: true,
  appliesToNationalities: [],
  appliesToQualifications: [],
  excerpt: "IELTS Academic Overall Band: 6.0 is required for admission",
  sourceUrl: "https://u.example/p",
  ...over,
});
const pages = new Map([
  ["https://u.example/p", "Duration 4Y Department of Test"],
]);

describe("curate", () => {
  it("keeps a duration the page prints and drops one it does not", () => {
    expect(curate(base(), pages).payload.program?.duration).toBe("4Y");
    const other = base();
    other.program!.duration = "5 years";
    const result = curate(other, pages);
    expect(result.payload.program?.duration).toBeNull();
    expect(result.dropped.join()).toContain("not printed");
  });
  it("turns the words null and N/A into missing values", () => {
    const input = base();
    input.program!.teachingLanguage = "null";
    input.program!.duration = "N/A";
    const { payload } = curate(input, pages);
    expect(payload.program?.teachingLanguage).toBeNull();
    expect(payload.program?.duration).toBeNull();
  });
  it("drops typed rules whose number is missing from the quote", () => {
    const result = curate(
      base({
        requirements: [
          rule({}) as never,
          rule({
            type: "TOEFL",
            minimum: 80,
            excerpt: "TOEFL iBT total: 79 or above",
          }) as never,
        ],
      }),
      pages,
    );
    expect(result.payload.requirements.map((r) => r.type)).toEqual(["IELTS"]);
  });
  it("drops rules scoped only to local admission routes", () => {
    const subjects =
      "HKDSE elective subjects: any 2 subjects, with one elective being Visual Arts";
    const result = curate(
      base({
        requirements: [
          rule({}) as never,
          rule({
            type: "OTHER",
            minimum: null,
            appliesToQualifications: ["HKDSE"],
            excerpt: subjects,
          }) as never,
          rule({
            type: "OTHER",
            minimum: null,
            appliesToQualifications: ["Chinese Mainland JEE"],
            excerpt: subjects,
          }) as never,
          rule({
            type: "OTHER",
            minimum: null,
            appliesToQualifications: ["HKDSE", "International Qualifications"],
            excerpt: subjects,
          }) as never,
        ],
      }),
      pages,
    );
    expect(
      result.payload.requirements.map((r) => r.appliesToQualifications),
    ).toEqual([[], ["HKDSE", "International Qualifications"]]);
    expect(result.dropped.join()).toContain("local admission route only");
  });
  it("drops the test type when sources disagree on its minimum", () => {
    const result = curate(
      base({
        requirements: [
          rule({}) as never,
          rule({
            minimum: 6.5,
            excerpt: "IELTS Academic Overall Band: 6.5 is required here",
          }) as never,
        ],
      }),
      pages,
    );
    expect(result.payload.requirements).toHaveLength(0);
  });
  it("never keeps an offer announcement as a deadline", () => {
    const result = curate(
      base({
        intakes: [
          {
            academicYear: "2027",
            term: "Fall",
            route: "Direct",
            openDate: null,
            deadline: "2026-12-31T00:00:00Z",
            timezone: null,
            excerpt: "Announcement of Offers 20261231 Application Closes 2027",
            sourceUrl: null,
          },
          {
            academicYear: "2027",
            term: "Fall",
            route: "Direct",
            openDate: null,
            deadline: "2027-06-30T00:00:00Z",
            timezone: null,
            excerpt: "Application Closes Date Checker 20270630 Year 2027",
            sourceUrl: null,
          },
        ],
      }),
      pages,
    );
    expect(result.payload.intakes.map((i) => i.deadline)).toEqual([
      "2027-06-30T00:00:00Z",
    ]);
  });
  it("drops scores whose type does not match the quote", () => {
    const result = curate(
      base({
        requirements: [
          rule({
            type: "SAT",
            minimum: 610,
            label: "English proof",
            excerpt: "SAT Evidence-Based Reading and Writing 610 or above",
          }) as never,
          rule({
            type: "QUALIFICATION",
            minimum: 6.5,
            excerpt: "IELTS Academic overall band 6.5 or above is accepted",
          }) as never,
        ],
      }),
      pages,
    );
    expect(result.payload.requirements).toHaveLength(0);
  });
  it("keeps a quoted scholarship and clears claims its quote does not state", () => {
    const quote =
      "The Entrance Scholarship is awarded to selected students admitted to the School each year";
    const scholarship = {
      name: "Entrance Scholarship",
      provider: "U",
      officialUrl: "https://u.example/s",
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
      excerpt: quote,
      sourceUrl: null,
    };
    const result = curate(
      base({ scholarships: [scholarship, { ...scholarship }] as never }),
      pages,
    );
    expect(result.payload.scholarships).toHaveLength(1);
    expect(result.payload.scholarships[0].tuitionCoverage).toBeNull();
    expect(result.payload.scholarships[0].fundingCategory).toBe("UNKNOWN");
  });
});

describe("labelWindow", () => {
  const cuhk =
    "2 Oct 2026 Application Opens 2 17 Oct 2026 Information Day 3 12 Nov 2026 Application Deadline for Advance Offer Round (*1) 4 From Dec 2026 Notifications to successful applicants 5 7 Jan 2027 Application Deadline for Regular Round (*1)";
  it("labels a written date with the text that follows it, not the previous row", () => {
    expect(labelWindow(cuhk, "2027-01-07")).toMatch(
      /Application Deadline for Regular/,
    );
    expect(labelWindow(cuhk, "2027-01-07")).not.toMatch(/Notifications/);
    expect(labelWindow(cuhk, "2026-10-02")).toMatch(/Application Opens/);
  });
  it("labels a compact date with the text before it", () => {
    const hkust =
      "Date 25 Nov Year 2026 Description Title Deadline for Priority Round Applications Date Checker 20261125";
    expect(labelWindow(hkust, "2026-11-25")).toMatch(/Deadline for Priority/);
  });
  it("returns null when the date is absent", () => {
    expect(labelWindow("nothing here", "2026-11-25")).toBeNull();
  });
});
describe("quotedOverall", () => {
  it("reads one stated overall score and refuses dated or mixed scores", () => {
    expect(
      quotedOverall(
        "IELTS (Academic) An overall band score of 6.0 or above in one sitting",
      ),
    ).toBe(6);
    expect(
      quotedOverall(
        "Pearson Test of English Academic (PTE Academic) Overall score of 64 or above",
      ),
    ).toBe(64);
    expect(
      quotedOverall(
        "TOEFL (iBT) (For tests taken before 21 January 2026) Total Score of 80 or above",
      ),
    ).toBeNull();
    expect(
      quotedOverall("Overall score of 6.5, or overall score of 7.0 for Law"),
    ).toBeNull();
  });
});
describe("dated test scales", () => {
  it("keeps a TOEFL score tied to a test date as free text", () => {
    const quote =
      "For tests taken on or after January 21, 2026: An overall score of 5.0 or above in the TOEFL internet-based test (TOEFL iBT)";
    const { payload } = curate(
      base({
        requirements: [
          rule({ type: "TOEFL", minimum: 5, excerpt: quote }) as never,
        ],
      }),
      pages,
    );
    expect(payload.requirements.map((r) => [r.type, r.minimum])).toEqual([
      ["OTHER", null],
    ]);
  });
});
describe("citations", () => {
  it("re-points a mistyped page URL to the one registered page holding the quote", () => {
    const quote = "IELTS Academic Overall Band: 6.5 is required for admission";
    const { payload } = curate(
      base({
        requirements: [
          rule({
            minimum: 6.5,
            excerpt: quote,
            sourceUrl: "https://u.example/typo",
          }) as never,
        ],
      }),
      new Map([...pages, ["https://u.example/english", "Language: " + quote]]),
    );
    expect(payload.requirements[0]?.sourceUrl).toBe(
      "https://u.example/english",
    );
  });
});
