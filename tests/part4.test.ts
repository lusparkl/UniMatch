import { describe, expect, it } from "vitest";
import { defaultProfile, type Profile, type Program } from "../lib/domain";
import { demoPrograms } from "../lib/demo";
import { matchProgram } from "../lib/matching";
import { actionFor, actionsFor } from "../lib/actions";
import { suggestions } from "../lib/whatif";
import { arithmetic } from "../lib/arithmetic";
import { fullyChecked, programTier } from "../lib/trust";
import { convert } from "../lib/fx";
import { personas } from "../lib/personas";
import {
  COUNTRY_OPTIONS,
  QUALIFICATION_OPTIONS,
  canonical,
  sameQualification,
} from "../lib/profile-options";
import { documentScope } from "../lib/documents";
import { profileSchema } from "../lib/domain";

const now = new Date("2026-10-27");
const student: Profile = {
  ...defaultProfile,
  nationality: "Vietnam",
  educationCountry: "Vietnam",
  fieldOfStudy: "Computer Science",
  ielts: 7,
  budget: 40000,
  currency: "USD",
  funding: "PARTIAL",
};
// Northstar (fictional): IELTS 6.5, complete requirements, US$31,000 a year, guaranteed full-tuition award
// for IELTS 7, a 2027 Fall intake closing 2027-05-01.
const program = (change: (p: Program) => void = () => {}) => {
  const p = structuredClone(demoPrograms[0]);
  change(p);
  return p;
};
const run = (p: Program, s: Partial<Profile> = {}) =>
  matchProgram(p, { ...student, ...s }, now);

describe("actions for UNKNOWN checks (7.5)", () => {
  const p = program((p) => (p.officialUrl = "https://example.edu/bsc"));
  it("asks for a missing score, linked to its profile field", () => {
    const m = run(p, { ielts: null });
    const english = m.academic.find((c) => c.kind === "IELTS")!;
    expect(actionFor(english, p, { ...student, ielts: null })).toEqual({
      label: "Add your IELTS score",
      href: "/profile#ielts",
      external: false,
    });
  });
  it("links an unverifiable rule to the official page", () => {
    const m = run(
      program((p) => {
        p.officialUrl = "https://example.edu/bsc";
        p.requirementsComplete = false;
      }),
    );
    const completeness = m.academic.find(
      (c) => c.label === "Requirements completeness",
    )!;
    expect(actionFor(completeness, p, student)).toMatchObject({
      label: "Check the official page",
      href: "https://example.edu/bsc",
      external: true,
    });
  });
  it("gives no action for PASS or FAIL, and none twice", () => {
    const m = run(p);
    expect(m.academic.every((c) => !actionFor(c, p, student))).toBe(true);
    const unknown = { label: "x", state: "UNKNOWN" as const, reason: "r" };
    expect(actionsFor([unknown, unknown], p, student)).toHaveLength(1);
  });
});

describe("what would change this? (7.3)", () => {
  it("suggests the published English minimum when the score is below it", () => {
    const s = suggestions(program(), { ...student, ielts: 6 }, now);
    expect(s).toContainEqual({
      dimension: "academic",
      text: "If your IELTS were 6.5 (now 6), the English check would pass.",
    });
  });
  it("asks for a score when the student has none", () => {
    const s = suggestions(program(), { ...student, ielts: null }, now);
    expect(s[0].action).toEqual({
      label: "Add your IELTS score",
      href: "/profile#ielts",
      external: false,
    });
  });
  it("finds the smallest budget that improves the financial check", () => {
    // Without the award (IELTS 6.5 is below its 7), the full US$31,000 is due.
    const s = suggestions(
      program(),
      { ...student, ielts: 6.5, budget: 20000 },
      now,
    );
    const budget = s.find((x) => x.dimension === "financial")!;
    expect(budget.text).toBe(
      "If your budget were US$31,000 (now US$20,000), the financial check would pass.",
    );
    expect(run(program(), { ielts: 6.5, budget: 31000 }).financial).toBe(
      "PASS",
    );
    expect(run(program(), { ielts: 6.5, budget: 30999 }).financial).not.toBe(
      "PASS",
    );
  });
  it("relaxes the funding preference one step only when it helps", () => {
    const p = program((p) => (p.scholarships = []));
    // Without any award, neither a full ride nor full tuition cover can be met; partial aid can.
    const s = suggestions(p, { ...student, funding: "TUITION" }, now);
    expect(s.map((x) => x.text)).toContain(
      "If partial aid were enough instead of full tuition cover, the financial check would pass.",
    );
    expect(
      suggestions(p, { ...student, funding: "FULL_RIDE" }, now).filter((x) =>
        x.text.startsWith("If full tuition"),
      ),
    ).toEqual([]);
  });
  it("suggests another listed intake", () => {
    const p = program((p) =>
      p.intakes.push({ ...p.intakes[0], academicYear: "2028" }),
    );
    const s = suggestions(p, { ...student, intake: "2029-Fall" }, now);
    expect(s.map((x) => x.text)).toContain(
      "If you applied for the 2027 Fall intake instead of 2029 Fall, the application check would pass.",
    );
  });
  it("suggests nothing when nothing would improve", () => {
    expect(suggestions(program(), student, now)).toEqual([]);
  });
});

describe("visible arithmetic (7.4)", () => {
  it("lists each part, the total and the remaining cost per scenario", () => {
    const p = program();
    const a = arithmetic(p, student, run(p));
    expect(a.parts.map((l) => l.value)).toEqual([
      "US$18,000",
      "US$12,000",
      "US$1,000",
    ]);
    expect(a.total.value).toBe("US$31,000");
    expect(a.exchange).toBeNull();
    expect(a.scenarios[1].lines[0]).toEqual({
      label: "Tuition coverage 100%",
      value: "−US$18,000",
    });
    expect(a.scenarios[1].lines.at(-1)).toMatchObject({
      value: "US$13,000",
      state: "PASS",
    });
  });
  it("shows the lower-bound FAIL with the conversion", () => {
    const p = program((p) => {
      p.costs = [
        {
          ...p.costs[0],
          tuition: 240000,
          living: null,
          other: null,
          currency: "HKD",
        },
      ];
      p.scholarships = [];
    });
    const a = arithmetic(
      p,
      { ...student, budget: 12000 },
      run(p, { budget: 12000 }),
    );
    const usd = convert(240000, "HKD", "USD")!;
    expect(a.total.value).toBe("Incomplete: only tuition is verified");
    expect(a.exchange?.value).toMatch(/^1 USD = \d+\.\d{3} HKD$/);
    const line = a.scenarios[0].lines[0];
    expect(line.state).toBe("FAIL");
    expect(line.value).toContain("HK$240,000 ÷ ");
    expect(line.value).toContain(
      "= US$" +
        Math.round(usd).toLocaleString("en") +
        " > US$12,600 → FAIL before any aid",
    );
  });
});

describe("trust (7.6)", () => {
  it("counts a programme as fully checked only with complete requirements and a complete cost", () => {
    expect(fullyChecked(program(), "2027")).toBe(true);
    expect(
      fullyChecked(
        program((p) => (p.costs[0].living = null)),
        "2027",
      ),
    ).toBe(false);
    expect(
      fullyChecked(
        program((p) => (p.requirementsComplete = false)),
        "2027",
      ),
    ).toBe(false);
  });
  it("takes the weakest tier", () => {
    expect(programTier(program())).toBe(1);
    expect(
      programTier(program((p) => (p.costs[0].status = "SOURCE_BACKED"))),
    ).toBe(2);
    expect(
      programTier(program((p) => (p.requirements[0].status = "OUTDATED"))),
    ).toBe(3);
  });
});

describe("sample students (7.1)", () => {
  it("are valid profiles with distinct ids", () => {
    for (const p of personas)
      expect(profileSchema.parse(p.profile)).toBeTruthy();
    expect(new Set(personas.map((p) => p.id)).size).toBe(personas.length);
  });
  it("use only values the profile pickers offer", () => {
    for (const { profile } of personas) {
      expect(COUNTRY_OPTIONS).toContain(profile.nationality);
      expect(COUNTRY_OPTIONS).toContain(profile.educationCountry);
      if (profile.qualification)
        expect(QUALIFICATION_OPTIONS).toContain(profile.qualification);
    }
  });
});

describe("profile pickers", () => {
  it("accept a listed value in any case and nothing else", () => {
    expect(canonical(COUNTRY_OPTIONS, "  south korea ")).toBe("South Korea");
    expect(canonical(QUALIFICATION_OPTIONS, "ib diploma")).toBe("IB Diploma");
    expect(canonical(COUNTRY_OPTIONS, "Korea")).toBeNull();
    expect(canonical(QUALIFICATION_OPTIONS, "IB")).toBeNull();
  });
  it("offer the qualification names published rules use", () => {
    for (const q of ["IB Diploma", "GCE A-Level", "International A-Level"])
      expect(QUALIFICATION_OPTIONS).toContain(q);
    expect(new Set(COUNTRY_OPTIONS).size).toBe(COUNTRY_OPTIONS.length);
  });
  it("match the names official pages use for the same qualification", () => {
    expect(sameQualification("International Baccalaureate", "IB Diploma")).toBe(
      true,
    );
    expect(sameQualification("IB", "ib diploma")).toBe(true);
    for (const q of ["GCE A-Level", "International A-Level"])
      expect(sameQualification("GCE A-level /International A-level", q)).toBe(
        true,
      );
    expect(sameQualification("SAT/AP", "SAT / ACT / AP")).toBe(true);
    expect(sameQualification("New Zealand", "New Zealand NCEA")).toBe(true);
    expect(
      sameQualification("Other overseas qualifications", "Other qualification"),
    ).toBe(true);
    expect(
      sameQualification("International Baccalaureate", "GCE A-Level"),
    ).toBe(false);
    expect(
      sameQualification("International Qualifications", "IB Diploma"),
    ).toBe(false);
    expect(sameQualification("Some local diploma", "some  local diploma")).toBe(
      true,
    );
  });
  it("scope school-system documents to the picked qualification", () => {
    expect(
      documentScope(
        "CBSE Standard XII marksheet",
        "Indian board exams (CBSE / CISCE / state)",
      ),
    ).toBe("APPLIES");
    expect(documentScope("Gaokao results", "Chinese Gaokao")).toBe("APPLIES");
    expect(documentScope("Gaokao results", "Russian Attestat")).toBe(
      "NOT_APPLICABLE",
    );
  });
});
