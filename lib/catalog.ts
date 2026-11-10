import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { effectiveStatus } from "./research/freshness";
import { catalogSource, demoMode, enabledCountries } from "./config";
import { demoPrograms } from "./demo";
import { ruleSchema, type Evidence, type Program } from "./domain";
import type { SourceEvidence } from "@/generated/prisma/client";
type LoadedEvidence = SourceEvidence & { document: { lastCheckedAt: Date } };
type Kind = "deadline" | "scholarship" | "admissions";
const brief = <T extends { evidence?: Evidence }>(x: T): T =>
  x.evidence ? { ...x, evidence: { ...x.evidence, excerpt: "" } } : x;
/** Programs for list views (results, shortlist): no retrieved-page sources and no evidence excerpts, which only the detail page shows. */
export const listPrograms = async (): Promise<Program[]> =>
  (await getPrograms()).map((p) => ({
    ...p,
    sources: undefined,
    requirements: p.requirements.map(brief),
    intakes: p.intakes.map(brief),
    costs: p.costs.map(brief),
    documents: p.documents.map(brief),
    scholarships: p.scholarships.map((s) => ({
      ...brief(s),
      rules: s.rules.map(brief),
    })),
  }));
/** Published programmes as stored, before read-time freshness. Snapshot export writes these rows. */
export async function queryRows(countries?: string[]) {
  const { db } = await import("./db");
  return db.degreeProgram.findMany({
    where: {
      published: true,
      ...(countries ? { university: { country: { in: countries } } } : {}),
    },
    orderBy: { id: "asc" },
    include: {
      university: {
        include: {
          scholarships: {
            where: { programId: null },
            orderBy: { id: "asc" },
            include: {
              scholarship: {
                include: {
                  evidence: {
                    include: { document: { select: { lastCheckedAt: true } } },
                  },
                },
              },
            },
          },
          documents: {
            orderBy: { retrievedAt: "desc" },
            take: 12,
            select: { url: true, text: true, retrievedAt: true },
          },
        },
      },
      requirements: {
        orderBy: { id: "asc" },
        include: {
          evidence: {
            include: { document: { select: { lastCheckedAt: true } } },
          },
        },
      },
      intakes: {
        orderBy: { id: "asc" },
        include: {
          evidence: {
            include: { document: { select: { lastCheckedAt: true } } },
          },
        },
      },
      costs: {
        orderBy: { id: "asc" },
        include: {
          evidence: {
            include: { document: { select: { lastCheckedAt: true } } },
          },
        },
      },
      documents: {
        orderBy: { id: "asc" },
        include: {
          evidence: {
            include: { document: { select: { lastCheckedAt: true } } },
          },
        },
      },
      scholarships: {
        orderBy: { id: "asc" },
        include: {
          scholarship: {
            include: {
              evidence: {
                include: { document: { select: { lastCheckedAt: true } } },
              },
            },
          },
        },
      },
    },
  });
}
export type CatalogRow = Awaited<ReturnType<typeof queryRows>>[number];
export type CatalogSnapshot = {
  exportedAt: string;
  commit: string | null;
  programmes: CatalogRow[];
};
const stable = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const items = value.map(stable);
    return items.every((i) => i && typeof i === "object" && "id" in i)
      ? items.sort((a, b) =>
          String((a as { id: string }).id).localeCompare(
            String((b as { id: string }).id),
          ),
        )
      : items;
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    );
  return value;
};
/** Snapshot file contents. Keys and IDs are sorted so diffs between exports stay small. */
export const snapshotJson = (
  programmes: CatalogRow[],
  commit: string | null,
  exportedAt = new Date().toISOString(),
) =>
  JSON.stringify(
    stable({ exportedAt, commit, programmes } satisfies CatalogSnapshot),
    null,
    1,
  ) + "\n";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** Parses an exported snapshot; ISO timestamps become Dates again, as Prisma returns them. */
export const parseSnapshot = (json: string): CatalogSnapshot =>
  JSON.parse(json, (key, value) =>
    key !== "exportedAt" && typeof value === "string" && ISO.test(value)
      ? new Date(value)
      : value,
  );
export const snapshotPath = () =>
  path.resolve(
    process.cwd(),
    process.env.CATALOG_SNAPSHOT_PATH ?? "data/catalog-snapshot.json",
  );
let snapshot: { file: string; data: CatalogSnapshot } | undefined;
/** The bundled catalog snapshot, read once per process. Snapshot mode never imports the database module. */
export function loadSnapshot(): CatalogSnapshot {
  const file = snapshotPath();
  if (snapshot?.file !== file)
    snapshot = { file, data: parseSnapshot(readFileSync(file, "utf8")) };
  return snapshot.data;
}
export async function getPrograms(
  forceReal = false,
  now = new Date(),
): Promise<Program[]> {
  const enabled = enabledCountries();
  if (demoMode() && !forceReal)
    return demoPrograms.filter((p) => enabled.includes(p.country));
  const rows =
    catalogSource() === "snapshot" && !forceReal
      ? loadSnapshot().programmes.filter((p) =>
          enabled.includes(p.university.country),
        )
      : await queryRows(enabled);
  return rows.map((row) => toProgram(row, now));
}
/** Maps a stored row to the student view, applying freshness at `now`. */
export function toProgram(p: CatalogRow, now: Date): Program {
  const state = (
    status: Program["requirements"][number]["status"],
    e: LoadedEvidence,
    kind: Kind = "admissions",
  ) => effectiveStatus(status, e.document.lastCheckedAt, kind, now);
  const evidence = (e: LoadedEvidence): Evidence => ({
    academicYear: e.relevantAcademicYear,
    url: e.url,
    excerpt: e.excerpt,
    retrievedAt: e.retrievedAt.toISOString(),
    status: state(e.verificationStatus, e),
  });
  return {
    id: p.id,
    universityId: p.universityId,
    university: p.university.name,
    country: p.university.country,
    city: p.university.city,
    title: p.title,
    degreeLevel: p.degreeLevel,
    fieldOfStudy: p.fieldOfStudy,
    teachingLanguage: p.teachingLanguage,
    duration: p.duration,
    officialUrl: p.officialUrl,
    demo: false,
    requirementsComplete: p.requirementsComplete,
    sources: p.university.documents.map((d) => ({
      url: d.url,
      excerpt: d.text.slice(0, 220),
      retrievedAt: d.retrievedAt.toISOString(),
      status: "NEEDS_REVIEW" as const,
    })),
    requirements: p.requirements.map((r) => ({
      ...ruleSchema.parse(r.conditions),
      status: state(r.verificationStatus, r.evidence),
      evidence: evidence(r.evidence),
    })),
    intakes: p.intakes.map((i) => ({
      academicYear: i.academicYear,
      term: i.intakeTerm,
      route: i.applicationRoute,
      openDate: i.openDate?.toISOString() ?? null,
      deadline: i.deadline?.toISOString() ?? null,
      timezone: i.deadlineTimezone,
      status: i.evidence
        ? state(i.verificationStatus, i.evidence, "deadline")
        : "UNKNOWN",
      evidence: i.evidence ? evidence(i.evidence) : undefined,
    })),
    costs: p.costs.map((c) => ({
      tuition: c.tuitionAmount,
      living: c.livingCostAmount,
      other: c.additionalCosts,
      currency: c.currency,
      period: c.period,
      status: state(c.verificationStatus, c.evidence),
      evidence: evidence(c.evidence),
    })),
    scholarships: [...p.scholarships, ...p.university.scholarships]
      .filter(
        ({ scholarship: s }) =>
          !s.degreeLevels.length || s.degreeLevels.includes(p.degreeLevel),
      )
      .map(({ scholarship: s }) => ({
        id: s.id,
        name: s.name,
        rules: [
          ...ruleSchema
            .extend({ excerpt: z.string().optional() })
            .array()
            .parse(s.qualificationConditions),
          ...(s.nationalityRestrictions.length
            ? [
                ruleSchema.parse({
                  type: "NATIONALITY",
                  label: "Scholarship citizenship eligibility",
                  minimum: null,
                  scale: null,
                  allowed: s.nationalityRestrictions,
                  mandatory: true,
                  appliesToNationalities: [],
                  appliesToQualifications: [],
                }),
              ]
            : []),
        ].map((r) => ({
          ...r,
          status: state(s.verificationStatus, s.evidence, "scholarship"),
          evidence: {
            ...evidence(s.evidence),
            excerpt:
              "excerpt" in r && typeof r.excerpt === "string"
                ? r.excerpt
                : s.evidence.excerpt,
          },
        })),
        tuitionCoverage: s.tuitionCoverage,
        stipendAmount: s.stipendAmount,
        currency: s.stipendCurrency,
        fundingCategory: s.fundingCategory,
        status: state(s.verificationStatus, s.evidence, "scholarship"),
        deadline: s.applicationDeadline?.toISOString() ?? null,
        renewalConditions: s.renewalConditions,
        evidence: evidence(s.evidence),
      })),
    documents: p.documents.map((d) => ({
      name: d.documentType,
      mandatory: d.mandatory,
      evidence: evidence(d.evidence),
    })),
    lastResearched:
      p.university.documents[0]?.retrievedAt.toISOString() ?? null,
  };
}
