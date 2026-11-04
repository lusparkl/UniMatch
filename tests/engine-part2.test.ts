import { describe, expect, it } from "vitest";
import { defaultProfile, type Profile, type Program } from "../lib/domain";
import { demoPrograms } from "../lib/demo";
import { compareMatches, fieldTier, matchProgram } from "../lib/matching";
import { convert } from "../lib/fx";
import { documentChecklist, documentScope } from "../lib/documents";
import { tierLabel, trustTier } from "../lib/trust";
import { institutionDate } from "../lib/research/timezone";

const now = new Date("2026-10-27");
const student: Profile = {
  ...defaultProfile,
  nationality: "Vietnam",
  educationCountry: "Vietnam",
  fieldOfStudy: "Computer Science",
  ielts: 7,
  budget: 15000,
  currency: "USD",
  funding: "PARTIAL",
};
type Cost = Program["costs"][number];
const cost = (extra: Partial<Cost>): Cost => ({
  tuition: null,
  living: null,
  other: null,
  currency: "HKD",
  period: "ANNUAL",
  status: "SOURCE_BACKED",
  ...extra,
});
const withCosts = (
  costs: Cost[],
  scholarships: Program["scholarships"] = [],
) => {
  const p = structuredClone(demoPrograms[0]);
  p.costs = costs;
  p.scholarships = scholarships;
  return p;
};
const award = (
  extra: Partial<Program["scholarships"][number]>,
): Program["scholarships"][number] => ({
  ...structuredClone(demoPrograms[0].scholarships[0]),
  name: "Half-tuition award",
  rules: [],
  fundingCategory: "COMPETITIVE",
  tuitionCoverage: 0.5,
  stipendAmount: 0,
  currency: "HKD",
  ...extra,
});
const run = (p: Program, s: Partial<Profile> = {}) =>
  matchProgram(p, { ...student, ...s }, now);
// HKD amount whose USD value is `usd` at the stored reference rate.
const hkdFor = (usd: number) => usd / convert(1, "HKD", "USD")!;

describe("lower-bound cost rule (W2a)", () => {
  it("fails when tuition alone is far above the budget", () => {
    const m = run(withCosts([cost({ tuition: 230000 })]));
    expect(m.financial).toBe("FAIL");
    const s = m.scenarios[0];
    expect(s).toMatchObject({
      partial: true,
      lowerBound: 230000,
      remaining: null,
    });
    expect(s.lowerBoundConverted).toBeCloseTo(
      convert(230000, "HKD", "USD")!,
      6,
    );
    expect(s.reason).toContain("Even tuition alone exceeds your budget");
    expect(s.reason).toContain("15,750 USD");
  });

  it("keeps a converted tuition inside the 5% band unknown", () => {
    const m = run(withCosts([cost({ tuition: hkdFor(15000 * 1.04) })]));
    expect(m.scenarios[0].affordable).toBe("UNKNOWN");
    expect(m.financial).toBe("UNKNOWN");
  });

  it("fails a converted tuition just past the band", () => {
    expect(
      run(withCosts([cost({ tuition: hkdFor(15000 * 1.06) })])).financial,
    ).toBe("FAIL");
  });

  it("uses the exact budget when no conversion is involved", () => {
    const usd = (tuition: number) =>
      run(withCosts([cost({ tuition, currency: "USD" })])).financial;
    expect(usd(15001)).toBe("FAIL");
    expect(usd(15000)).toBe("UNKNOWN");
  });

  it("lets a half-tuition scholarship keep the result open", () => {
    const m = run(withCosts([cost({ tuition: 230000 })], [award({})]));
    expect(m.scenarios[0].affordable).toBe("FAIL");
    expect(m.scenarios[1].lowerBound).toBe(115000);
    expect(m.scenarios[1].affordable).toBe("UNKNOWN");
    expect(m.financial).toBe("UNKNOWN");
  });

  it("fails a scholarship whose remaining tuition still exceeds the budget", () => {
    const m = run(
      withCosts([cost({ tuition: 230000 })], [award({ tuitionCoverage: 0.1 })]),
    );
    expect(m.scenarios[1].affordable).toBe("FAIL");
    expect(m.scenarios[1].reason).toContain("Even with this award");
    expect(m.financial).toBe("FAIL");
  });

  it("gives no lower bound when coverage is unknown", () => {
    const m = run(
      withCosts(
        [cost({ tuition: 230000 })],
        [award({ tuitionCoverage: null })],
      ),
    );
    expect(m.scenarios[1].lowerBound).toBeNull();
    expect(m.financial).toBe("UNKNOWN");
  });

  it("never passes on a partial total", () => {
    const m = run(withCosts([cost({ tuition: 100, currency: "USD" })]), {
      budget: 1_000_000,
    });
    expect(m.scenarios[0].affordable).toBe("UNKNOWN");
    expect(m.financial).toBe("UNKNOWN");
  });

  it("fails a full-ride seeker only when no listed option can work", () => {
    expect(
      run(withCosts([cost({ tuition: 230000 })]), { funding: "FULL_RIDE" })
        .financial,
    ).toBe("FAIL");
    expect(
      run(withCosts([cost({ tuition: 1000, currency: "USD" })]), {
        funding: "FULL_RIDE",
      }).financial,
    ).toBe("UNKNOWN");
  });
});

describe("cost rows (W2a, W2f)", () => {
  it("combines parts quoted in separate rows of one currency", () => {
    const m = run(
      withCosts([
        cost({ tuition: 10000, currency: "USD" }),
        cost({ living: 3000, other: 500, currency: "USD" }),
      ]),
    );
    expect(m.scenarios[0].remaining).toBe(13500);
    expect(m.financial).toBe("PASS");
  });

  it("names a disagreement and never picks one figure", () => {
    const m = run(
      withCosts([
        cost({ tuition: 10000, living: 2000, other: 0, currency: "USD" }),
        cost({ tuition: 12000, currency: "USD" }),
      ]),
    );
    expect(m.scenarios[0].remaining).toBeNull();
    expect(m.scenarios[0].reason).toContain(
      "Official figures disagree: tuition 10,000 USD vs 12,000 USD",
    );
    expect(m.financial).toBe("UNKNOWN");
  });

  it("fails disagreeing figures only when even the smallest is too high", () => {
    expect(
      run(
        withCosts([
          cost({ tuition: 30000, currency: "USD" }),
          cost({ tuition: 32000, currency: "USD" }),
        ]),
      ).financial,
    ).toBe("FAIL");
  });

  it("does not combine rows in different currencies", () => {
    const m = run(
      withCosts([
        cost({ tuition: 10000, currency: "USD" }),
        cost({ living: 3000, other: 0, currency: "EUR" }),
      ]),
    );
    expect(m.scenarios[0].remaining).toBeNull();
    expect(m.scenarios[0].lowerBound).toBeNull();
    expect(m.financial).toBe("UNKNOWN");
  });

  it("explains costs published for another cycle", () => {
    const m = run(
      withCosts([
        cost({
          tuition: 1000,
          living: 1000,
          other: 0,
          currency: "USD",
          evidence: {
            academicYear: "2026",
            url: "https://example.edu/fees",
            excerpt: "Tuition fee",
            retrievedAt: "2026-10-01T00:00:00Z",
            status: "SOURCE_BACKED",
          },
        }),
      ]),
    );
    expect(m.scenarios[0].reason).toBe(
      "Costs: Published for the 2026 cycle; 2027 not yet published.",
    );
  });
});

describe("evidence year and intake terms (W2b)", () => {
  it("states the cycle and links the source", () => {
    const p = structuredClone(demoPrograms[0]);
    p.requirements[0].evidence = {
      academicYear: "2026",
      url: "https://example.edu/admissions",
      excerpt: "IELTS 6.5",
      retrievedAt: "2026-10-01T00:00:00Z",
      status: "ADMIN_VERIFIED",
    };
    const english = run(p).academic.find((c) => c.kind === "IELTS")!;
    expect(english).toMatchObject({
      state: "UNKNOWN",
      reason: "Published for the 2026 cycle; 2027 not yet published.",
      url: "https://example.edu/admissions",
    });
  });

  it("reads September terms as Fall but leaves round names alone", () => {
    const term = (t: string) => {
      const p = structuredClone(demoPrograms[0]);
      p.intakes[0].term = t;
      return run(p).applicationState;
    };
    for (const t of ["September", "Sept", "September entry", "Sept 2027 entry"])
      expect(term(t), t).toBe("PASS");
    for (const t of ["regular round", "final", "Spring"])
      expect(term(t), t).toBe("UNKNOWN");
  });
});

describe("field tiers (W2c)", () => {
  const prog = (title: string, fieldOfStudy = title) => ({
    title,
    fieldOfStudy,
  });
  it("ranks exact, leading and combined matches", () => {
    expect(fieldTier(prog("Business"), "Business")).toBe(1);
    expect(
      fieldTier(prog("BEng in Computer Science", "Computer Science"), "CS"),
    ).toBe(1);
    expect(
      fieldTier(
        prog("Bachelor of Business Administration", "Business Administration"),
        "Business",
      ),
    ).toBe(2);
    expect(fieldTier(prog("Global Business Studies"), "Business")).toBe(2);
    expect(
      fieldTier(
        prog("BSc in Biotechnology and Business", "Biotechnology and Business"),
        "Business",
      ),
    ).toBe(3);
    expect(
      fieldTier(
        prog(
          "Fashion (Fashion Design / Fashion Business) - BA (Hons) Scheme",
          "Fashion",
        ),
        "Business",
      ),
    ).toBe(3);
    expect(fieldTier(prog("Nursing"), "Business")).toBe(0);
  });

  it("passes leading fields, keeps related fields unknown and sorts them after", () => {
    const make = (title: string, id: string) => ({
      ...structuredClone(demoPrograms[0]),
      id,
      title,
      fieldOfStudy: title,
    });
    const lead = run(make("Business Administration", "a"), {
      fieldOfStudy: "Business",
    });
    const related = run(make("Biotechnology and Business", "b"), {
      fieldOfStudy: "Business",
    });
    expect(lead.academic[1].state).toBe("PASS");
    expect(related.academic[1]).toMatchObject({ state: "UNKNOWN" });
    expect(related.academic[1].reason).toContain("Related field");
    expect([related, lead].sort(compareMatches)[0].program.id).toBe("a");
  });
});

describe("A-level route (W2d)", () => {
  const aLevel = () => {
    const p = structuredClone(demoPrograms[0]);
    p.requirements.push({
      ...p.requirements[0],
      type: "GRADE",
      label: "A-level: three subjects at grade A",
      minimum: 3,
      scale: "A-level subjects at A",
      appliesToQualifications: ["GCE A-Level", "International A-Level"],
    });
    return p;
  };
  const grade = (qualification: string, value: number | null) =>
    run(aLevel(), {
      qualification,
      grade: value,
      gradingScale: "A-level subjects at A",
    }).academic.find((c) => c.label.startsWith("A-level"));
  it("evaluates the route only for A-level students", () => {
    expect(grade("GCE A-Level", 3)?.state).toBe("PASS");
    expect(grade("International A-Level", 2)?.state).toBe("FAIL");
    expect(grade("IB Diploma", 40)).toBeUndefined();
    expect(grade("", null)?.state).toBe("UNKNOWN");
  });
});

describe("document scoping (W2e)", () => {
  const listed = [
    { name: "Standard X results", mandatory: true },
    { name: "Academic transcript", mandatory: true },
  ];
  it("drops system-specific documents for other qualifications", () => {
    expect(documentScope("Standard X results", "IB Diploma")).toBe(
      "NOT_APPLICABLE",
    );
    const items = documentChecklist(
      listed,
      { ...student, qualification: "IB Diploma" },
      {},
    );
    expect(items.map((i) => i.name)).toEqual(["Academic transcript"]);
  });
  it("keeps them unverified, not missing, without a qualification", () => {
    const items = documentChecklist(
      listed,
      { ...student, qualification: "" },
      {},
    );
    expect(items[0]).toMatchObject({ unverified: true, have: "UNTRACKED" });
  });
  it("keeps them for students of that system", () => {
    expect(documentScope("Standard X results", "CBSE Class 12")).toBe(
      "APPLIES",
    );
    expect(documentScope("HKDSE certificate", "HKDSE")).toBe("APPLIES");
    expect(documentScope("Passport copy", "IB Diploma")).toBe("APPLIES");
  });
});

describe("trust tiers and time zones", () => {
  it("maps statuses to three tiers", () => {
    expect(tierLabel[trustTier("ADMIN_VERIFIED")]).toBe("Human-reviewed");
    expect(tierLabel[trustTier("SOURCE_BACKED")]).toBe(
      "Auto-verified from official source",
    );
    for (const s of [
      "NEEDS_REVIEW",
      "CONFLICTING",
      "OUTDATED",
      "UNKNOWN",
    ] as const)
      expect(tierLabel[trustTier(s)]).toBe("Needs verification");
  });
  it("pins Korean date-only deadlines to the end of the day in Seoul", () => {
    expect(institutionDate("2027-01-15T00:00:00Z", "South Korea", true)).toBe(
      "2027-01-15T23:59:59+09:00",
    );
  });
});
