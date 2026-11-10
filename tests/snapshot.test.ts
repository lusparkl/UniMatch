import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
// Snapshot mode must never load the database module.
vi.mock("@/lib/db", () => {
  throw new Error("database module imported in snapshot mode");
});
import {
  getPrograms,
  parseSnapshot,
  snapshotJson,
  toProgram,
  type CatalogRow,
} from "@/lib/catalog";

const checked = new Date("2026-11-01T00:00:00Z");
const evidence = (id: string) => ({
  id,
  url: "https://example.edu/admissions",
  excerpt: "IELTS 6.5",
  relevantAcademicYear: "2027",
  retrievedAt: checked,
  verificationStatus: "SOURCE_BACKED",
  document: { lastCheckedAt: checked },
});
// The fields toProgram reads; the rest of a database row does not matter here.
const row = (country = "Hong Kong") =>
  ({
    id: "p1",
    universityId: "u1",
    title: "BSc in Testing",
    degreeLevel: "BACHELOR",
    fieldOfStudy: "Testing",
    teachingLanguage: "English",
    duration: "4 years",
    officialUrl: "https://example.edu/bsc",
    requirementsComplete: false,
    university: {
      name: "Example University",
      country,
      city: "Example",
      scholarships: [],
      documents: [
        { url: "https://example.edu", text: "Welcome", retrievedAt: checked },
      ],
    },
    requirements: [
      {
        id: "r1",
        verificationStatus: "SOURCE_BACKED",
        conditions: {
          type: "IELTS",
          label: "IELTS",
          minimum: 6.5,
          scale: null,
          allowed: [],
          mandatory: true,
          appliesToNationalities: [],
          appliesToQualifications: [],
        },
        evidence: evidence("e1"),
      },
    ],
    intakes: [
      {
        id: "i1",
        academicYear: "2027",
        intakeTerm: "Fall",
        applicationRoute: "Main",
        openDate: null,
        deadline: new Date("2027-01-15T15:59:59Z"),
        deadlineTimezone: "Asia/Hong_Kong",
        verificationStatus: "SOURCE_BACKED",
        evidence: evidence("e2"),
      },
    ],
    costs: [],
    documents: [],
    scholarships: [],
  }) as unknown as CatalogRow;

describe("catalog snapshot", () => {
  it("round-trips rows with dates intact", () => {
    const json = snapshotJson([row()], "abc", "2026-11-10T00:00:00.000Z");
    const parsed = parseSnapshot(json);
    expect(parsed.exportedAt).toBe("2026-11-10T00:00:00.000Z");
    expect(parsed.commit).toBe("abc");
    expect(parsed.programmes[0].intakes[0].deadline).toBeInstanceOf(Date);
    const now = new Date("2026-11-03T00:00:00Z");
    expect(toProgram(parsed.programmes[0], now)).toEqual(toProgram(row(), now));
  });

  it("applies freshness when read, from the stored check date", () => {
    vi.stubEnv("FRESHNESS_DEADLINE_DAYS", "7");
    const fresh = toProgram(row(), new Date("2026-11-05T00:00:00Z"));
    const stale = toProgram(row(), new Date("2026-11-20T00:00:00Z"));
    expect(fresh.intakes[0].status).toBe("SOURCE_BACKED");
    expect(stale.intakes[0].status).toBe("OUTDATED");
    // Admissions facts use the longer scholarship window (30 days by default).
    expect(stale.requirements[0].status).toBe("SOURCE_BACKED");
  });

  it("reads the snapshot file in snapshot mode and filters enabled countries", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "snapshot-"));
    const file = path.join(dir, "catalog.json");
    writeFileSync(
      file,
      snapshotJson([row(), { ...row("Germany"), id: "p2" }], null),
    );
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("CATALOG_SOURCE", "snapshot");
    vi.stubEnv("CATALOG_SNAPSHOT_PATH", file);
    vi.stubEnv("ENABLED_COUNTRIES", "Hong Kong,South Korea");
    const programs = await getPrograms(false, checked);
    expect(programs.map((p) => p.id)).toEqual(["p1"]);
    expect(programs[0].requirements[0].minimum).toBe(6.5);
  });
});
