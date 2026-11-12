import { defaultProfile, type Profile } from "./domain";
import type { Match } from "./matching";

// Sample students for the demo: typical cases, not real people. The stories below are checked against the
// catalog by tests/personas.test.ts and the smoke test. If the data stops supporting a story, change the
// persona (budget or scores), never the data.
export type Persona = {
  id: "ib" | "alevel" | "fullride" | "sat" | "duolingo" | "missing";
  name: string;
  summary: string;
  /** Country the student applies from. */
  from: string;
  /** One-line situation shown on the sample card. */
  tag: string;
  /** Label and value pairs shown on the sample card. */
  facts: [string, string][];
  profile: Profile;
  /** What the demo shows for this persona; every claim must hold for the catalog. */
  story: string;
  /** Failures of the story against matches over the catalog; empty when it holds. */
  check: (matches: Match[]) => string[];
};

const base: Profile = { ...defaultProfile, intake: "2027-Fall" };
const hk = (m: Match) => m.program.country === "Hong Kong";
const kr = (m: Match) => m.program.country === "South Korea";
const need = (ok: boolean, failure: string) => (ok ? [] : [failure]);

export const personas: Persona[] = [
  {
    id: "ib",
    from: "India",
    tag: "Strong profile",
    facts: [
      ["Qualification", "IB Diploma · 38"],
      ["English", "IELTS 7.5"],
      ["Budget", "US$30,000 a year"],
      ["Aid", "Partial is fine"],
    ],
    name: "IB student, strong English",
    summary: "India · IB Diploma 38 · IELTS 7.5 · US$30,000 · partial aid",
    profile: {
      ...base,
      nationality: "India",
      educationCountry: "India",
      qualification: "IB Diploma",
      grade: 38,
      gradingScale: "IB Diploma points",
      ielts: 7.5,
      fieldOfStudy: "Business Administration",
      budget: 30000,
      currency: "USD",
      funding: "PARTIAL",
    },
    story:
      "Hong Kong flagship programmes pass the academic check on a verified IB route.",
    check: (ms) =>
      need(
        ms.some((m) => hk(m) && m.academicState === "PASS"),
        "no Hong Kong programme passes the academic check",
      ),
  },
  {
    id: "alevel",
    from: "Vietnam",
    tag: "Tight budget",
    facts: [
      ["Qualification", "GCE A-Level"],
      ["English", "TOEFL 95"],
      ["Budget", "US$12,000 a year"],
      ["Aid", "Partial is fine"],
    ],
    name: "A-level, tight budget",
    summary: "Vietnam · GCE A-Level · TOEFL 95 · US$12,000 · partial aid",
    profile: {
      ...base,
      nationality: "Vietnam",
      educationCountry: "Vietnam",
      qualification: "GCE A-Level",
      gradingScale: "UK A-level",
      toefl: 95,
      fieldOfStudy: "Computer Science",
      budget: 12000,
      currency: "USD",
      funding: "PARTIAL",
    },
    story:
      "Hong Kong tuition alone is above the budget, so the financial check fails before any aid; in South Korea a guaranteed scholarship can pass.",
    check: (ms) => [
      ...need(
        ms.some(
          (m) =>
            hk(m) &&
            m.financial === "FAIL" &&
            m.scenarios.some((s) => s.partial),
        ),
        "no Hong Kong programme fails on the tuition lower bound",
      ),
      // The Korean half needs a guaranteed Korean scholarship confirmed by the owner (ADMIN_VERIFIED, plan
      // 3.7), which is what the engine treats as guaranteed, and a KRW reference rate. Until both exist, only
      // the Hong Kong half is checked.
      ...(ms.some(
        (m) =>
          kr(m) &&
          m.program.scholarships.some(
            (s) =>
              s.fundingCategory === "GUARANTEED" &&
              s.status === "ADMIN_VERIFIED",
          ),
      )
        ? need(
            ms.some(
              (m) =>
                kr(m) &&
                m.financial === "PASS" &&
                m.scenarios.some((s) => s.award === "GUARANTEED"),
            ),
            "no South Korean programme passes financially through a guaranteed scholarship",
          )
        : []),
    ],
  },
  {
    id: "fullride",
    from: "Nigeria",
    tag: "Full scholarship",
    facts: [
      ["Qualification", "IB Diploma"],
      ["English", "IELTS 7"],
      ["Budget", "US$5,000 a year"],
      ["Aid", "Full ride only"],
    ],
    name: "Needs a full ride",
    summary: "Nigeria · IB Diploma · IELTS 7 · US$5,000 · full ride",
    profile: {
      ...base,
      nationality: "Nigeria",
      educationCountry: "Nigeria",
      qualification: "IB Diploma",
      gradingScale: "IB Diploma points",
      ielts: 7,
      fieldOfStudy: "Engineering",
      budget: 5000,
      currency: "USD",
      funding: "FULL_RIDE",
    },
    story:
      "Scholarships appear as competitive, never as guaranteed money, unless the university guarantees them.",
    check: (ms) => [
      ...need(
        ms.some((m) => m.scenarios.some((s) => s.award === "COMPETITIVE")),
        "no scholarship scenario is shown as competitive",
      ),
      ...need(
        !ms.some(
          (m) =>
            m.financial === "PASS" &&
            !m.scenarios.some((s) => s.award === "GUARANTEED"),
        ),
        "a financial PASS without a guaranteed award",
      ),
    ],
  },
  {
    id: "sat",
    from: "Indonesia",
    tag: "Test-score route",
    facts: [
      ["Qualification", "SAT 1480"],
      ["English", "TOEFL 102"],
      ["Budget", "US$22,000 a year"],
      ["Aid", "Partial is fine"],
    ],
    name: "SAT score, aiming for Seoul",
    summary: "Indonesia · SAT 1480 · TOEFL 102 · US$22,000 · partial aid",
    profile: {
      ...base,
      nationality: "Indonesia",
      educationCountry: "Indonesia",
      qualification: "SAT / ACT / AP",
      sat: 1480,
      toefl: 102,
      fieldOfStudy: "Economics",
      budget: 22000,
      currency: "USD",
      funding: "PARTIAL",
    },
    story:
      "An SAT score alone is not a verified entry route, so the qualification check stays UNKNOWN and nothing passes academically on a guess.",
    check: (ms) => [
      ...need(
        !ms.some((m) => m.academicState === "PASS"),
        "an academic PASS on an SAT score alone",
      ),
      ...need(
        ms.some((m) =>
          m.academic.some(
            (c) => c.kind === "QUALIFICATION" && c.state === "UNKNOWN",
          ),
        ),
        "no qualification check stays UNKNOWN",
      ),
    ],
  },
  {
    id: "duolingo",
    from: "Egypt",
    tag: "Alternative test",
    facts: [
      ["Qualification", "IB Diploma · 31"],
      ["English", "Duolingo 120"],
      ["Budget", "US$10,000 a year"],
      ["Aid", "Partial is fine"],
    ],
    name: "Duolingo instead of IELTS",
    summary: "Egypt · IB Diploma 31 · Duolingo 120 · US$10,000 · partial aid",
    profile: {
      ...base,
      nationality: "Egypt",
      educationCountry: "Egypt",
      qualification: "IB Diploma",
      gradingScale: "IB Diploma points",
      grade: 31,
      duolingo: 120,
      fieldOfStudy: "Computer Science",
      budget: 10000,
      currency: "USD",
      funding: "PARTIAL",
    },
    story:
      "Duolingo 120 is below a published Duolingo minimum, so the English check names the other accepted tests instead of passing or failing.",
    check: (ms) =>
      need(
        ms.some((m) =>
          m.academic.some(
            (c) =>
              c.kind === "ENGLISH" &&
              c.state === "UNKNOWN" &&
              /below the minimum/.test(c.reason),
          ),
        ),
        "no English check is below a Duolingo minimum with other tests still open",
      ),
  },
  {
    id: "missing",
    from: "Ukraine",
    tag: "Gaps to fill",
    facts: [
      ["Qualification", "Local qualification"],
      ["English", "No test yet"],
      ["Budget", "US$15,000 a year"],
      ["Aid", "Partial is fine"],
    ],
    name: "Missing scores",
    summary: "Ukraine · local qualification · no English test · US$15,000",
    profile: {
      ...base,
      nationality: "Ukraine",
      educationCountry: "Ukraine",
      qualification: "Other qualification",
      fieldOfStudy: "Computer Science",
      budget: 15000,
      currency: "USD",
      funding: "PARTIAL",
    },
    story:
      "Results stay UNKNOWN with reasons, and each one says what to add or check.",
    check: (ms) => [
      ...need(
        !ms.some((m) => m.academicState === "PASS"),
        "an academic PASS without any English score",
      ),
      ...need(
        ms.some((m) => m.academicState === "UNKNOWN"),
        "no academic UNKNOWN",
      ),
    ],
  },
];
export const personaById = (id: string) => personas.find((p) => p.id === id);
