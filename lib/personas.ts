import { defaultProfile, type Profile } from "./domain";
import type { Match } from "./matching";

// Sample students for the demo: typical cases, not real people. The stories below are checked against the
// catalog by tests/personas.test.ts and the smoke test. If the data stops supporting a story, change the
// persona (budget or scores), never the data.
export type Persona = {
  id: "ib" | "alevel" | "fullride" | "missing";
  name: string;
  summary: string;
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
      // Korean data arrives in Part 3; the Korean half of the story is checked once it is published.
      ...(ms.some(kr)
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
    id: "missing",
    name: "Missing scores",
    summary: "Ukraine · local qualification · no English test · US$15,000",
    profile: {
      ...base,
      nationality: "Ukraine",
      educationCountry: "Ukraine",
      qualification: "Atestat",
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
