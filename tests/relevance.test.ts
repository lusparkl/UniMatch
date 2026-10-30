import { describe, expect, it } from "vitest";
import {
  assembleBundle,
  assessPage,
  linkScore,
  dropUnquoted,
  mergeClaims,
  programTitleIssues,
  pruneClaims,
  rankPages,
  sameProgram,
  selectWindows,
  widenExcerpt,
} from "../lib/research/relevance";

const facts =
  "BEng in Electronic Engineering\nApplicants need IELTS 6.5 overall.\nTuition fee for non-local students is HK$ 180,000 per year.\nApplication deadline: 15 January 2027.\n" +
  "x".repeat(200);

describe("research relevance gates", () => {
  it("extracts pages that combine a topic with amounts, tests or deadlines", () => {
    expect(assessPage("https://a.edu/admission", facts).worthExtracting).toBe(
      true,
    );
  });
  it("skips noise URLs and pages without facts", () => {
    expect(
      assessPage("https://a.edu/privacy-notice", facts).worthExtracting,
    ).toBe(false);
    expect(
      assessPage(
        "https://a.edu/about",
        "Welcome to our vibrant campus. ".repeat(20),
      ).worthExtracting,
    ).toBe(false);
  });
  it("ranks admission links above generic and noise links", () => {
    expect(
      linkScore("https://a.edu/admissions/international", "Apply"),
    ).toBeGreaterThan(linkScore("https://a.edu/programmes", "Programmes"));
    expect(
      linkScore("https://a.edu/news/engineering", "Engineering news"),
    ).toBe(0);
    expect(linkScore("https://a.edu/our-graduates", "Our graduates")).toBe(0);
  });
  it("flags generic or unsupported program titles", () => {
    expect(
      programTitleIssues(
        "Local and international applicants with post-secondary qualifications",
        "Local and international applicants with post-secondary qualifications",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      programTitleIssues("Engineering Undergraduate Program", "x").length,
    ).toBe(2);
    expect(programTitleIssues("BEng in Electronic Engineering", facts)).toEqual(
      [],
    );
  });
  it("keeps dense lines when the page exceeds the cap", () => {
    const filler = Array.from(
      { length: 200 },
      (_, i) => `apply step ${i}`,
    ).join("\n");
    const out = selectWindows(
      filler + "\nTuition HK$ 120,000 deadline 2027\n",
      500,
    );
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).toContain("HK$ 120,000");
  });
  it("matches duplicate program titles across abbreviations", () => {
    expect(
      sameProgram(
        "Computer Science (BEng)",
        "Bachelor of Engineering in Computer Science",
      ),
    ).toBe(true);
    expect(
      sameProgram("BEng in Electronic Engineering", "BEng in Computer Science"),
    ).toBe(false);
  });
});

describe("excerpt validation tolerates whitespace normalisation", () => {
  it("accepts an excerpt whose spaces differ from the source's", async () => {
    const { validateEvidence } = await import("../lib/research/extraction");
    const base = {
      program: null,
      academicYear: null,
      requirements: [],
      intakes: [],
      costs: [],
      documents: [],
      ambiguities: [],
      scholarships: [
        {
          name: "A",
          provider: "B",
          officialUrl: "https://a.edu/x",
          degreeLevels: ["BACHELOR" as const],
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
          fundingCategory: "UNKNOWN" as const,
          excerpt: "Only senior subjects in Category A are considered.",
        },
      ],
    };
    const text = "Only senior\u00a0subjects in\nCategory A are considered.";
    expect(validateEvidence(base, text, () => true)).toEqual([]);
    expect(
      validateEvidence(base, "Different text entirely here.", () => true)
        .length,
    ).toBe(1);
  });
});

describe("excerpt snapping", () => {
  const page =
    "Date\n 25 Nov\n Year\n 2026\n Description Title\n Deadline for Priority Round Applications\n Date Checker\n 20261125\n Title Other";
  it("returns the real passage for a quotation that skipped a word", async () => {
    const { snapExcerpt } = await import("../lib/research/relevance");
    expect(
      snapExcerpt(
        "Year 2026 Description Title Deadline for Priority Round Applications Date Checker 20261125",
        page,
      ),
    ).toBe(
      "Year 2026 Description Title Deadline for Priority Round Applications Date Checker 20261125",
    );
    const snapped = snapExcerpt(
      "Date 25 Nov Deadline for Priority Round Applications Date Checker 20261125",
      page,
    );
    expect(snapped).toContain("Year 2026");
    expect(page.replace(/\s+/g, " ")).toContain(snapped!);
  });
  it("refuses invented text", async () => {
    const { snapExcerpt } = await import("../lib/research/relevance");
    expect(
      snapExcerpt("Application Deadline 17 Nov 2030 for everyone", page),
    ).toBeNull();
  });
});

type Req = {
  type: string;
  allowed: string[];
  minimum: number | null;
  appliesToQualifications: string[];
  excerpt: string;
  sourceUrl: string | null;
};
const req = (over: Partial<Req> = {}): Req => ({
  type: "GRADE",
  allowed: ["6"],
  minimum: null,
  appliesToQualifications: [],
  excerpt: "Grade 6 or better in Mathematics at higher level",
  sourceUrl: null,
  ...over,
});
const base = () => ({
  requirements: [] as Req[],
  intakes: [] as {
    academicYear: string;
    term: string;
    openDate: string | null;
    deadline: string | null;
    sourceUrl: string | null;
  }[],
  costs: [] as {
    tuition: number | null;
    living: number | null;
    other: number | null;
    excerpt: string;
  }[],
  scholarships: [] as {
    name: string;
    tuitionCoverage: number | null;
    stipendAmount: number | null;
    deadline: string | null;
    excerpt: string;
    sourceUrl: string | null;
  }[],
});

describe("pruneClaims", () => {
  it("nulls cost amounts missing from the excerpt and drops empty costs", () => {
    const p = base();
    p.costs.push(
      {
        tuition: 260000,
        living: 65000,
        other: null,
        excerpt: "Tuition Fee HKD 260,000 per academic year",
      },
      { tuition: null, living: 9, other: null, excerpt: "no figures" },
    );
    const dropped = pruneClaims(p);
    expect(p.costs).toHaveLength(1);
    expect(p.costs[0]).toMatchObject({ tuition: 260000, living: null });
    expect(dropped.length).toBe(2);
  });

  it("keeps one amount per cost entry and requires a living/fee label", () => {
    const p = base();
    p.costs.push(
      {
        tuition: 240000,
        living: 18515,
        other: 53040,
        excerpt:
          "Tuition HK$240,000 accommodation HK$18,515 meal charges HK$53,040",
      },
      { tuition: null, living: 65000, other: null, excerpt: "~HKD 65,000" },
      {
        tuition: null,
        living: 50000,
        other: null,
        excerpt: "Living expenses Up to HKD50,000 per year",
      },
    );
    pruneClaims(p);
    expect(p.costs).toHaveLength(2);
    expect(p.costs[0]).toMatchObject({
      tuition: 240000,
      living: null,
      other: null,
    });
    expect(p.costs[1]).toMatchObject({ living: 50000 });
  });

  it("clears guaranteed coverage for an 'up to' award and unsupported stipend/deadline", () => {
    const p = base();
    p.scholarships.push({
      name: "Admissions scholarships",
      tuitionCoverage: 1,
      stipendAmount: 65000,
      deadline: "2026-11-25T00:00:00Z",
      excerpt:
        "Admissions scholarships: award level can be up to full tuition plus a living allowance",
      sourceUrl: null,
    });
    pruneClaims(p);
    expect(p.scholarships[0]).toMatchObject({
      tuitionCoverage: null,
      stipendAmount: null,
      deadline: null,
    });
  });

  it("drops scholarships whose invented name is not in the quote", () => {
    const p = base();
    p.scholarships.push({
      name: "University Admissions Scholarship for Other Qualifications",
      tuitionCoverage: null,
      stipendAmount: null,
      deadline: null,
      excerpt: "Award level can be up to full tuition",
      sourceUrl: null,
    });
    pruneClaims(p);
    expect(p.scholarships).toHaveLength(0);
  });

  it("drops threshold-free lists, fragments, JUPAS and transfer-page claims", () => {
    const p = base();
    p.requirements.push(
      req({
        type: "OTHER",
        allowed: Array.from({ length: 12 }, (_, i) => "Q" + i),
      }),
      req({ sourceUrl: "https://join.hkust.edu.hk/admissions/post-secondary" }),
      req({ excerpt: "Grade 5 in a) AP Calculus BC; and" }),
      req({ appliesToQualifications: ["JUPAS"] }),
      req(),
    );
    p.intakes.push({
      academicYear: "2027",
      term: "Fall",
      openDate: null,
      deadline: "2026-11-25T00:00:00Z",
      sourceUrl: "https://join.hkust.edu.hk/admissions/post-secondary",
    });
    pruneClaims(p);
    expect(p.requirements).toHaveLength(1);
    expect(p.intakes).toHaveLength(0);
  });

  it("drops autumn intakes whose dates fall after the intake year starts", () => {
    const p = base();
    const intake = (academicYear: string) => ({
      academicYear,
      term: "September",
      openDate: null,
      deadline: "2026-11-25T00:00:00Z",
      sourceUrl: null,
    });
    p.intakes.push(intake("2026"), intake("2027"));
    pruneClaims(p);
    expect(p.intakes.map((i) => i.academicYear)).toEqual(["2027"]);
  });
});

describe("pruneClaims on thresholds", () => {
  it("clears a minimum its quote does not print", () => {
    const p = base();
    p.requirements.push(
      req({
        type: "IELTS",
        minimum: 7,
        excerpt: "IELTS Academic Overall Band: 6.0 (UKVI also accepted)",
      }),
    );
    pruneClaims(p);
    expect(p.requirements[0].minimum).toBeNull();
  });

  it("turns a test whose scale changed by date into an unevaluated OTHER rule", () => {
    const p = base();
    p.requirements.push(
      req({
        type: "TOEFL",
        minimum: 4.5,
        excerpt:
          "TOEFL Prior to 21 January 2026 Total Score: 80 From 21 January 2026 onwards Total Score: 4.5",
      }),
      req({
        type: "IELTS",
        minimum: 6,
        excerpt: "IELTS Academic Overall Band: 6.0 (UKVI also accepted)",
      }),
    );
    pruneClaims(p);
    expect(p.requirements[0]).toMatchObject({ type: "OTHER", minimum: null });
    expect(p.requirements[1]).toMatchObject({ type: "IELTS", minimum: 6 });
  });
});

describe("widenExcerpt and dropUnquoted", () => {
  const page =
    "CODE JS3868 ENTRY Sept 2027 Entry STUDY MODE Full-time. Application Deadline Non-JUPAS Year 1 2026-11-17 International 2026-11-17 end";
  it("widens a quote to include the entry year as a real run of the page", () => {
    const quote = "Application Deadline Non-JUPAS Year 1 2026-11-17";
    const wide = widenExcerpt(quote, page, ["2027", "2026"]);
    expect(wide).toContain("2027 Entry");
    expect(page.includes(wide!)).toBe(true);
    expect(widenExcerpt(quote, page, ["2031"])).toBeNull();
  });
  it("drops claims not verbatim in the cited page", () => {
    const url = "https://a.edu/p";
    const q = (excerpt: string) => ({ excerpt, sourceUrl: url });
    const payload = {
      requirements: [],
      intakes: [
        q("Application Deadline Non-JUPAS Year 1"),
        q("made up deadline text"),
      ],
      costs: [],
      documents: [],
      scholarships: [],
    };
    const dropped = dropUnquoted(payload, new Map([[url, page]]));
    expect(payload.intakes).toHaveLength(1);
    expect(dropped).toHaveLength(1);
  });
});

describe("mergeClaims", () => {
  const set = (...excerpts: string[]) => ({
    requirements: excerpts.map((excerpt) => ({ excerpt })),
    intakes: [],
    costs: [],
    documents: [],
    scholarships: [],
  });
  it("adds earlier claims with a new quote, ignores repeats, respects the cap", () => {
    const target = set("IELTS Academic Overall Band: 6.0");
    const added = mergeClaims(target, [
      set("IELTS  Academic Overall Band: 6.0", "Duolingo English Test 125"),
      set("PTE Academic 64"),
    ]);
    expect(added).toBe(2);
    expect(target.requirements.map((r) => r.excerpt)).toEqual([
      "IELTS Academic Overall Band: 6.0",
      "Duolingo English Test 125",
      "PTE Academic 64",
    ]);
  });
});

describe("rankPages and assembleBundle", () => {
  const doc = (url: string, text: string) => ({
    id: url,
    url,
    title: "",
    text,
    contentHash: url,
  });
  const base = "https://u.edu/admissions/international-qualifications";
  const program = { title: "BEng in AI", officialUrl: "https://u.edu/ai" };
  const filtered = (n: number) => base + "?general_requirement=" + n;
  const fees = "https://u.edu/fees";
  const facts = (label: string) =>
    label + " tuition HK$ 260,000 per year IELTS 6.0 overall. ".repeat(4);

  it("keeps program, scoped and institution pages and ignores siblings and stale filtered pages", () => {
    const docs = [
      doc("https://u.edu/ai", facts("ai")),
      doc("https://u.edu/cs", facts("cs")),
      doc(fees, facts("fees")),
      doc(filtered(1), facts("scoped")),
      doc(filtered(2), facts("other program")),
      doc(filtered(3), facts("stale")),
    ];
    const { ranked, ownUrls } = rankPages(
      program,
      docs,
      new Set([fees]),
      new Map([
        [filtered(1), "BEng in AI"],
        [filtered(2), "BEng in CS"],
      ]),
      ["https://u.edu/ai", "https://u.edu/cs"],
    );
    expect(ranked.map((r) => r.doc.url)).toEqual([
      "https://u.edu/ai",
      filtered(1),
      fees,
    ]);
    expect(ownUrls.has(filtered(1))).toBe(true);
  });

  it("sheds low-ranked shared pages first when over budget, never the program's own pages", () => {
    const big = (url: string, score: number) => ({
      doc: doc(
        url,
        Array.from({ length: 140 }, (_, i) =>
          `${url} row ${i} `.padEnd(100, "y"),
        ).join("\n"),
      ),
      score,
    });
    const shared = Array.from({ length: 12 }, (_, i) => filtered(10 + i));
    const ranked = [
      big("https://u.edu/ai", 100),
      big(filtered(1), 80),
      big(fees, 50),
      ...shared.map((u) => big(u, 40)),
    ];
    const { shed, sources, text } = assembleBundle(
      ranked,
      new Set([fees, ...shared]),
      new Set([filtered(1)]),
    );
    expect(shed.length).toBeGreaterThan(0);
    expect(shed.every((u) => u.includes("general_requirement"))).toBe(true);
    expect(sources.has("https://u.edu/ai")).toBe(true);
    expect(sources.has(fees)).toBe(true);
    expect(text).toContain("### SOURCE: https://u.edu/ai");
  });
});
