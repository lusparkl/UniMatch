import { z } from "zod";
import { effectiveStatus } from "./research/freshness";
import { db } from "./db";
import { demoMode } from "./config";
import { demoPrograms } from "./demo";
import { ruleSchema, type Evidence, type Program } from "./domain";
import type { SourceEvidence, SourceDocument } from "@/generated/prisma/client";
type LoadedEvidence = SourceEvidence & { document: SourceDocument };
const state = (
  status: Program["requirements"][number]["status"],
  e: LoadedEvidence,
  kind: "deadline" | "scholarship" | "admissions" = "admissions",
) => effectiveStatus(status, e.document.lastCheckedAt, kind);
const evidence = (e: LoadedEvidence): Evidence => ({
  academicYear: e.relevantAcademicYear,
  url: e.url,
  excerpt: e.excerpt,
  retrievedAt: e.retrievedAt.toISOString(),
  status: state(e.verificationStatus, e),
});
export async function getPrograms(forceReal = false): Promise<Program[]> {
  if (demoMode() && !forceReal) return demoPrograms;
  const rows = await db.degreeProgram.findMany({
    where: { published: true },
    include: {
      university: {
        include: {
          scholarships: {
            where: { programId: null },
            include: {
              scholarship: {
                include: { evidence: { include: { document: true } } },
              },
            },
          },
          documents: { orderBy: { retrievedAt: "desc" }, take: 12 },
        },
      },
      requirements: { include: { evidence: { include: { document: true } } } },
      intakes: { include: { evidence: { include: { document: true } } } },
      costs: { include: { evidence: { include: { document: true } } } },
      documents: { include: { evidence: { include: { document: true } } } },
      scholarships: {
        include: {
          scholarship: {
            include: { evidence: { include: { document: true } } },
          },
        },
      },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    universityId: p.universityId,
    university: p.university.name,
    country: p.university.country,
    city: p.university.city,
    title: p.title,
    degreeLevel: p.degreeLevel,
    fieldOfStudy: p.fieldOfStudy,
    teachingLanguage: p.teachingLanguage,
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
  }));
}
