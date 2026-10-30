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
  matchProgram,
} from "../lib/matching";
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
  it("requires all scholarship rules", () => {
    const p = program();
    p.scholarships[0].rules.push(
      r({ type: "NATIONALITY", allowed: ["Singapore"] }),
    );
    expect(match(p).scenarios[1].eligibility).toBe("FAIL");
  });
  it("does not compare currencies", () =>
    expect(match(program(), { ...profile, currency: "EUR" }).financial).toBe(
      "UNKNOWN",
    ));
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
});
