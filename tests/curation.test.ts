import { describe, expect, it } from "vitest";
import { quoter, squash } from "../scripts/curation";

const url = "https://admissions.example.edu/fees";
const page = `Local students
Tuition Fee  HKD 49,500
in 2027/28 academic year
Non-local Students
Tuition Fee (Non-local Students)*
HKD 260,000
in 2027/28 academic year`;

describe("curation quoter", () => {
  it("quotes from the first start to the first end after it, whitespace squashed", () => {
    const q = quoter(url, page);
    expect(
      q("Tuition Fee (Non-local Students)*", "in 2027/28 academic year"),
    ).toEqual({
      excerpt:
        "Tuition Fee (Non-local Students)* HKD 260,000 in 2027/28 academic year",
      sourceUrl: url,
    });
  });

  it("returns a substring of the squashed page, so evidence validation finds it", () => {
    const { excerpt } = quoter(url, page)("Local students", "HKD 49,500");
    expect(squash(page)).toContain(excerpt);
  });

  it("refuses a start or end that is not on the page", () => {
    const q = quoter(url, page);
    expect(() => q("Accommodation Fee")).toThrow(/not found/);
    expect(() => q("Non-local Students", "HKD 49,500")).toThrow(
      /not found after/,
    );
  });

  it("refuses an excerpt longer than the schema allows", () => {
    const long = "Start " + "word ".repeat(300) + "End";
    expect(() => quoter(url, long)("Start", "End")).toThrow(/over 1200/);
  });
});
