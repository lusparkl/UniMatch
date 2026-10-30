import { describe, expect, it } from "vitest";
import { defaultProfile, type Profile, type Program } from "../lib/domain";
import { demoPrograms } from "../lib/demo";
import {
  classifyDocument,
  documentChecklist,
  ownedFromProfile,
} from "../lib/documents";
import { readiness } from "../lib/readiness";

const profile: Profile = {
  ...defaultProfile,
  nationality: "Ukraine",
  educationCountry: "Ukraine",
  intake: "2027-Fall",
};
const program = (): Program => structuredClone(demoPrograms[0]);
const now = new Date("2026-10-27");

describe("document catalog", () => {
  it("maps free-text document names to known kinds", () => {
    expect(classifyDocument("Official academic transcripts")?.id).toBe(
      "transcript",
    );
    expect(classifyDocument("Letter of recommendation")?.id).toBe(
      "recommendation",
    );
    expect(classifyDocument("Statement of Purpose")?.id).toBe("motivation");
    expect(
      classifyDocument(
        "academic certificate(s)/ transcript(s) for qualifications",
      )?.id,
    ).toBe("transcript");
    expect(classifyDocument("Weekly campus tour")).toBeNull();
  });

  it("treats recorded test scores as held results", () => {
    expect(ownedFromProfile(profile)).toEqual({});
    expect(ownedFromProfile({ ...profile, ielts: 7 })).toEqual({
      english: "HAVE",
    });
    expect(ownedFromProfile({ ...profile, sat: 1400 })).toEqual({
      standardized: "HAVE",
    });
  });

  it("marks held, in-progress, missing and untracked documents", () => {
    const items = documentChecklist(
      [
        { name: "Passport copy", mandatory: true },
        { name: "Academic transcripts", mandatory: true },
        { name: "Recommendation letter", mandatory: false },
        { name: "Interview slot", mandatory: true },
      ],
      profile,
      { passport: "HAVE", transcript: "IN_PROGRESS" },
    );
    expect(items.map((i) => i.have)).toEqual([
      "HAVE",
      "IN_PROGRESS",
      "MISSING",
      "UNTRACKED",
    ]);
  });

  it("merges duplicates and falls back to a typical list marked unverified", () => {
    const merged = documentChecklist(
      [
        { name: "Transcript of records", mandatory: true },
        { name: "Academic transcripts", mandatory: true },
      ],
      profile,
      {},
    );
    expect(merged).toHaveLength(1);
    const typical = documentChecklist([], profile, {});
    expect(typical.length).toBeGreaterThan(0);
    expect(typical.every((i) => i.typical)).toBe(true);
  });
});

describe("readiness", () => {
  it("counts tests still to complete and documents still to prepare", () => {
    const p = program();
    p.documents = [
      { name: "Passport", mandatory: true },
      { name: "Transcripts", mandatory: true },
      { name: "Recommendation letters", mandatory: false },
    ];
    const result = readiness(
      p,
      { ...profile, ielts: null },
      { passport: "HAVE" },
      now,
    );
    expect(result.documentsToPrepare).toBe(1);
    expect(
      result.tests.some((t) => t.kind === "IELTS" || t.kind === "ENGLISH"),
    ).toBe(true);
    expect(result.testsToComplete).toBeGreaterThan(0);
  });

  it("reports no test gap once the student meets the English minimum", () => {
    const result = readiness(program(), { ...profile, ielts: 8 }, {}, now);
    expect(result.tests.filter((t) => t.state !== "PASS")).toHaveLength(0);
    expect(result.testsToComplete).toBe(0);
  });
});
