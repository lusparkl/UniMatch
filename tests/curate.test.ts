import { describe, expect, it } from "vitest";
import { curate, labelWindow } from "../lib/research/curate";
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
  it("leaves scholarships for manual review", () => {
    const result = curate(
      base({ scholarships: [{ name: "X" } as never] }),
      pages,
    );
    expect(result.payload.scholarships).toHaveLength(0);
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
