import { describe, it, expect } from "vitest";
import {
  defaultProfile,
  type Profile,
  type Program,
  type Requirement,
} from "../lib/domain";
import { demoPrograms } from "../lib/demo";
import {
  combine,
  evaluateEnglish,
  evaluateRule,
  fieldMatches,
  matchProgram,
} from "../lib/matching";
import { institutionDate } from "../lib/research/timezone";
import { convert, fxSource } from "../lib/fx";
const profile: Profile = {
  ...defaultProfile,
  nationality: "Ukraine",
  educationCountry: "Ukraine",
  ielts: 7,
  budget: 40000,
};
const now = new Date("2026-10-27");
const program = (): Program => structuredClone(demoPrograms[0]);
const match = (p = program(), s = profile) => matchProgram(p, s, now);
const r = (extra: Partial<Requirement>): Requirement => ({
  ...program().requirements[0],
  ...extra,
});
describe("three-valued matching", () => {
  it("fails any confirmed mandatory failure", () =>
    expect(combine(["PASS", "UNKNOWN", "FAIL"])).toBe("FAIL"));
  it("never promotes unknown to pass", () =>
    expect(combine(["PASS", "UNKNOWN"])).toBe("UNKNOWN"));
  it("meets published minimums with complete data", () =>
    expect(match().status).toBe("PASS"));
  it("checks language threshold", () =>
    expect(match(program(), { ...profile, ielts: 5 }).academicState).toBe(
      "FAIL",
    ));
  it("preserves missing English scores", () =>
    expect(match(program(), { ...profile, ielts: null }).academicState).toBe(
      "UNKNOWN",
    ));
  it("does not convert grades", () =>
    expect(
      evaluateRule(r({ type: "GRADE", minimum: 3, scale: "US GPA" }), {
        ...profile,
        grade: 90,
        gradingScale: "100-point",
      })?.state,
    ).toBe("UNKNOWN"));
  it("compares grades on the same scale", () =>
    expect(
      evaluateRule(r({ type: "GRADE", minimum: 80, scale: "100-point" }), {
        ...profile,
        grade: 90,
        gradingScale: "100-point",
      })?.state,
    ).toBe("PASS"));
  it("applies nationality restrictions", () =>
    expect(
      evaluateRule(r({ type: "NATIONALITY", allowed: ["Singapore"] }), profile)
        ?.state,
    ).toBe("FAIL"));
  it("ignores requirements for other nationalities", () =>
    expect(
      evaluateRule(r({ appliesToNationalities: ["Singapore"] }), profile),
    ).toBeNull());
  it("does not ignore missing qualification applicability", () =>
    expect(
      evaluateRule(r({ appliesToQualifications: ["IB"] }), profile)?.state,
    ).toBe("UNKNOWN"));
  it("expires deadlines", () => {
    const p = program();
    p.intakes[0].deadline = "2025-01-01T00:00:00Z";
    expect(match(p).applicationState).toBe("FAIL");
  });
  it("requires deadline timezone", () => {
    const p = program();
    p.intakes[0].timezone = null;
    expect(match(p).applicationState).toBe("UNKNOWN");
  });
  it("allows an alternative open route", () => {
    const p = program();
    p.intakes.push({
      ...p.intakes[0],
      route: "Closed",
      deadline: "2020-01-01T00:00:00Z",
    });
    expect(match(p).applicationState).toBe("PASS");
  });
  it("preserves missing deadlines", () => {
    const p = program();
    p.intakes = [];
    expect(match(p).applicationState).toBe("UNKNOWN");
  });
  it("does not call tuition-only funding a full ride", () =>
    expect(match().scenarios[1].fullRide).toBe(false));
  it("recognizes complete cost coverage", () =>
    expect(match(structuredClone(demoPrograms[4])).scenarios[1].fullRide).toBe(
      true,
    ));
  it("competitive full coverage is still not confirmed funding", () => {
    const m = match(structuredClone(demoPrograms[4]), {
      ...profile,
      budget: 0,
      funding: "FULL_RIDE",
    });
    expect(m.scenarios[1].award).toBe("COMPETITIVE");
    expect(m.financial).toBe("UNKNOWN");
  });
  it("guaranteed funding requires verified passed rules", () =>
    expect(match().scenarios[1].award).toBe("GUARANTEED"));
  it("does not combine multiple scholarship awards", () => {
    const p = program();
    p.scholarships.push({
      ...p.scholarships[0],
      id: "other",
      tuitionCoverage: 0,
      stipendAmount: 12000,
    });
    expect(match(p).scenarios).toHaveLength(3);
    expect(match(p).scenarios[1].remaining).toBe(13000);
  });
  it("treats an award made on admission as an eligibility pass", () => {
    const p = program();
    p.scholarships[0].rules = [r({ type: "ON_ADMISSION", allowed: [] })];
    expect(match(p).scenarios[1].eligibility).toBe("PASS");
    expect(match(p).scenarios[1].award).toBe("GUARANTEED");
    p.scholarships[0].rules[0].status = "SOURCE_BACKED";
    p.scholarships[0].status = "SOURCE_BACKED";
    expect(match(p).scenarios[1].award).toBe("COMPETITIVE");
  });
  it("bounds an unquantified stipend from above only", () => {
    const p = program();
    p.scholarships[0].stipendAmount = null; // demo total 31,000 USD, tuition 18,000 covered
    const within = match(p).scenarios[1];
    expect(within.remaining).toBeNull();
    expect(within.ceiling).toBe(13000);
    expect(within.affordable).toBe("PASS");
    expect(match(p).financial).toBe("PASS");
    const above = match(p, { ...profile, budget: 10000 }).scenarios[1];
    expect(above.affordable).toBe("UNKNOWN");
    expect(match(p, { ...profile, budget: 10000 }).financial).toBe("UNKNOWN");
  });
  it("requires all scholarship rules", () => {
    const p = program();
    p.scholarships[0].rules.push(
      r({ type: "NATIONALITY", allowed: ["Singapore"] }),
    );
    expect(match(p).scenarios[1].eligibility).toBe("FAIL");
  });
  it("converts other currencies at the reference rate", () => {
    const eur = convert(31000, "USD", "EUR")!; // demo total is 31,000 USD
    const budget = (factor: number) =>
      match(program(), { ...profile, currency: "EUR", budget: eur * factor })
        .scenarios[0];
    expect(budget(1.3).affordable).toBe("PASS");
    expect(budget(1.3).converted).toBeCloseTo(eur, 0);
    expect(budget(1.3).reason).toContain(fxSource.name);
    expect(budget(0.7).affordable).toBe("FAIL");
  });
  it("keeps converted amounts near the budget unknown", () => {
    const eur = convert(31000, "USD", "EUR")!;
    expect(
      match(program(), { ...profile, currency: "EUR", budget: eur * 1.02 })
        .scenarios[0].affordable,
    ).toBe("UNKNOWN");
  });
  it("does not compare currencies without a reference rate", () =>
    expect(match(program(), { ...profile, currency: "JPY" }).financial).toBe(
      "UNKNOWN",
    ));
  it("matches the field of study by its words", () => {
    const p = { fieldOfStudy: "Business Administration", title: "BBA" };
    expect(fieldMatches(p, "Business")).toBe(true);
    expect(fieldMatches(p, "business administration")).toBe(true);
    expect(
      fieldMatches(
        { fieldOfStudy: "Computing and Data Science", title: "BEng" },
        "Computer Science",
      ),
    ).toBe(true);
    expect(
      fieldMatches(
        {
          fieldOfStudy: "Engineering",
          title: "BEng in Artificial Intelligence",
        },
        "AI",
      ),
    ).toBe(true);
    expect(
      fieldMatches(
        { fieldOfStudy: "Political Science", title: "BSSc" },
        "Computer Science",
      ),
    ).toBe(false);
    expect(fieldMatches(p, "and")).toBe(false);
  });
  it("preserves missing costs", () => {
    const p = program();
    p.costs[0].living = null;
    expect(match(p).scenarios[0].remaining).toBeNull();
  });
  it("excludes conflicting critical facts from definitive conclusions", () => {
    const p = program();
    p.requirements[0].status = "CONFLICTING";
    expect(match(p).academicState).toBe("UNKNOWN");
  });
  it("master's prerequisite missing is unknown", () =>
    expect(
      match(structuredClone(demoPrograms[1]), {
        ...profile,
        degreeLevel: "MASTER",
        bachelorField: "",
      }).academicState,
    ).toBe("UNKNOWN"));
  it("master's field restriction evaluates explicitly", () =>
    expect(
      match(structuredClone(demoPrograms[1]), {
        ...profile,
        degreeLevel: "MASTER",
        bachelorField: "History",
      }).academicState,
    ).toBe("FAIL"));
  it("semester prices are not annualized without evidence", () => {
    const p = program();
    p.costs[0].period = "SEMESTER";
    expect(match(p).scenarios[0].remaining).toBeNull();
  });
  it("differing cost estimates remain uncertain", () => {
    const p = program();
    p.costs.push({ ...p.costs[0], tuition: 1 });
    expect(match(p).scenarios[0].remaining).toBeNull();
  });
});

describe("English tests as alternatives", () => {
  const test = (type: string, minimum: number): Requirement =>
    r({
      type: type as Requirement["type"],
      label: "English proof (any one accepted test) " + type,
      minimum,
      scale: null,
      allowed: [],
      mandatory: true,
      appliesToNationalities: [],
      appliesToQualifications: [],
    });
  const rules = [
    test("IELTS", 6),
    test("TOEFL", 80),
    test("DUOLINGO", 125),
    test("PTE", 64),
  ];
  const none = {
    ...profile,
    ielts: null,
    toefl: null,
    duolingo: null,
    pte: null,
  };

  it("passes when any one accepted test meets its minimum", () => {
    const check = evaluateEnglish(rules, { ...none, duolingo: 130 })!;
    expect(check.state).toBe("PASS");
    expect(check.reason).toContain("130");
  });

  it("stays unknown while no accepted test result is given", () => {
    const check = evaluateEnglish(rules, none)!;
    expect(check.state).toBe("UNKNOWN");
    expect(check.reason).toContain("IELTS 6");
    expect(check.reason).toContain("PTE 64");
  });

  it("does not fail a student whose other tests could still qualify", () => {
    const check = evaluateEnglish(rules, { ...none, ielts: 5 })!;
    expect(check.state).toBe("UNKNOWN");
    expect(check.reason).toContain("another accepted test");
  });

  it("fails only when every accepted test has a result below its minimum", () => {
    const check = evaluateEnglish(rules, {
      ...none,
      ielts: 5,
      toefl: 60,
      duolingo: 100,
      pte: 50,
    })!;
    expect(check.state).toBe("FAIL");
  });

  it("keeps single-test behaviour and feeds the program match", () => {
    expect(
      evaluateEnglish([test("IELTS", 6)], { ...none, ielts: 5 })!.state,
    ).toBe("FAIL");
    const p = program();
    p.requirements = [...rules];
    const result = matchProgram(p, { ...profile, ielts: null, toefl: 95 }, now);
    const english = result.academic.find((c) => c.label.startsWith("English"))!;
    expect(english.state).toBe("PASS");
  });

  it("groups unscored English alternatives instead of failing or adding checks", () => {
    const p = program();
    p.requirements = [
      test("IELTS", 6),
      r({
        type: "OTHER",
        label:
          "English proof (any one accepted test): Grade 4 or above in IB English",
        minimum: null,
        scale: null,
        allowed: [],
        mandatory: true,
        appliesToNationalities: [],
        appliesToQualifications: [],
      }),
    ];
    const low = matchProgram(p, { ...profile, ielts: 5 }, now);
    const english = low.academic.filter((c) => c.label.startsWith("English"));
    expect(english).toHaveLength(1);
    expect(english[0].state).toBe("UNKNOWN");
    expect(english[0].reason).toContain("Grade 4 or above in IB English");
    expect(
      matchProgram(p, { ...profile, ielts: 6.5 }, now).academic.find((c) =>
        c.label.startsWith("English"),
      )!.state,
    ).toBe("PASS");
  });
});

describe("intake terms", () => {
  it("treats Autumn and Fall as the same entry", () => {
    const p = program();
    p.intakes = p.intakes.map((i) => ({ ...i, term: "Fall" }));
    const [year] = profile.intake.split("-");
    const fall = matchProgram(p, { ...profile, intake: year + "-Fall" }, now);
    const autumn = matchProgram(
      p,
      { ...profile, intake: year + "-Autumn" },
      now,
    );
    expect(autumn.application).toEqual(fall.application);
    expect(fall.application.at(-1)!.reason).not.toContain(
      "Requested intake is not verified",
    );
  });
});

describe("institution time zones", () => {
  it("reads Hong Kong dates as Hong Kong time", () => {
    expect(institutionDate("2026-11-17T00:00:00Z", "Hong Kong", true)).toBe(
      "2026-11-17T23:59:59+08:00",
    );
    expect(institutionDate("2026-10-02T00:00:00Z", "Hong Kong", false)).toBe(
      "2026-10-02T00:00:00+08:00",
    );
    expect(institutionDate("2027-08-25T12:00:00Z", "Hong Kong", true)).toBe(
      "2027-08-25T12:00:00+08:00",
    );
  });
  it("keeps explicit offsets and other countries unchanged", () => {
    expect(
      institutionDate("2027-08-25T12:00:00+08:00", "Hong Kong", true),
    ).toBe("2027-08-25T12:00:00+08:00");
    expect(institutionDate("2027-01-15T00:00:00Z", "Hungary", true)).toBe(
      "2027-01-15T00:00:00Z",
    );
    expect(institutionDate(null, "Hong Kong", true)).toBeNull();
  });
});
