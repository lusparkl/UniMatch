import { db } from "../db";
import { Prisma } from "@/generated/prisma/client";
import { extractionSchema, validateEvidence } from "./extraction";
import { allowedUrl } from "./security";
import { ruleSchema } from "../domain";
import { sameProgram } from "./relevance";
type PageRow = {
  id: string;
  url: string;
  title: string;
  text: string;
  retrievedAt: Date;
  contentHash: string;
};
export async function reviewCandidate(
  id: string,
  action: "APPROVE" | "REJECT",
  administrator: string,
  revised?: unknown,
  requirementsComplete = false,
  options: {
    /** Verification written to the published rows; defaults to a human administrator's ADMIN_VERIFIED. */
    status?: "ADMIN_VERIFIED" | "SOURCE_BACKED";
    /** Drop the program's earlier facts first, so a fresh extraction supersedes stale rows. */
    replace?: boolean;
  } = {},
) {
  const status = options.status ?? "ADMIN_VERIFIED";
  return db.$transaction(
    async (tx) => {
      const candidate = await tx.extractionCandidate.findUniqueOrThrow({
        where: { id },
        include: {
          job: true,
          document: { include: { university: { include: { sources: true } } } },
        },
      });
      if (["RUNNING", "QUEUED", "RETRYING"].includes(candidate.job.status))
        throw new Error(
          "Wait until research finishes before reviewing this candidate",
        );
      if (candidate.reviewedAt)
        throw new Error("This candidate has already been reviewed");
      const payload = extractionSchema.parse(revised ?? candidate.payload);
      const publishedBefore = payload.program
        ? await tx.degreeProgram.findFirst({
            where: {
              universityId: candidate.document.universityId,
              title: payload.program.title,
              degreeLevel: payload.program.degreeLevel,
            },
            include: {
              requirements: true,
              intakes: true,
              costs: true,
              documents: true,
              scholarships: { include: { scholarship: true } },
            },
          })
        : null;
      const previousValue = JSON.parse(
        JSON.stringify({
          candidate: candidate.payload,
          publishedProgram: publishedBefore,
        }),
      ) as Prisma.InputJsonValue;
      if (action === "APPROVE") {
        // Program-targeted candidates cite several stored pages; resolve each cited page's latest version.
        const cited = new Set(
          [
            ...(payload.program ? [payload.program] : []),
            ...payload.requirements,
            ...payload.intakes,
            ...payload.costs,
            ...payload.documents,
            ...payload.scholarships,
            ...payload.scholarships.flatMap((s) => s.rules),
          ].flatMap((c) => (c.sourceUrl ? [c.sourceUrl] : [])),
        );
        const pages = new Map<string, PageRow>([
          [candidate.document.url, candidate.document],
        ]);
        for (const url of cited) {
          if (pages.has(url)) continue;
          const page = await tx.sourceDocument.findFirst({
            where: { universityId: candidate.document.universityId, url },
            orderBy: { retrievedAt: "desc" },
          });
          if (page) pages.set(url, page);
        }
        const issues = validateEvidence(
          payload,
          cited.size
            ? new Map([...pages].map(([url, page]) => [url, page.text]))
            : candidate.document.text,
          (url) => allowedUrl(url, candidate.document.university.sources),
        ).filter(
          (i) =>
            i.startsWith("Excerpt") ||
            i.startsWith("Citation") ||
            i.startsWith("Unapproved") ||
            i.startsWith("Unsupported intake year"),
        );
        if (issues.length) throw new Error(issues.join("; "));
        const doc = candidate.document;
        async function evidence(excerpt: string, sourceUrl?: string | null) {
          const page: PageRow =
            (sourceUrl && pages.get(sourceUrl)) || candidate.document;
          return tx.sourceEvidence.create({
            data: {
              documentId: page.id,
              url: page.url,
              title: page.title,
              excerpt,
              startOffset:
                page.text.indexOf(excerpt) >= 0
                  ? page.text.indexOf(excerpt)
                  : null,
              retrievedAt: page.retrievedAt,
              verifiedAt: status === "ADMIN_VERIFIED" ? new Date() : null,
              contentHash: page.contentHash,
              relevantAcademicYear: payload.academicYear,
              verificationStatus: status,
            },
          });
        }
        if (
          !payload.program &&
          (payload.requirements.length ||
            payload.intakes.length ||
            payload.costs.length ||
            payload.documents.length)
        )
          throw new Error("Program-specific facts need explicit program scope");
        if (payload.program && !publishedBefore) {
          const siblings = await tx.degreeProgram.findMany({
            where: {
              universityId: doc.universityId,
              degreeLevel: payload.program.degreeLevel,
            },
          });
          const duplicate = siblings.find((s) =>
            sameProgram(s.title, payload.program!.title),
          );
          if (duplicate)
            throw new Error(
              'Duplicate program: already published as "' +
                duplicate.title +
                '". Revise the title to match it before approving.',
            );
        }
        const p = payload.program
          ? await tx.degreeProgram.upsert({
              where: {
                universityId_title_degreeLevel: {
                  universityId: doc.universityId,
                  title: payload.program.title,
                  degreeLevel: payload.program.degreeLevel,
                },
              },
              create: {
                universityId: doc.universityId,
                title: payload.program.title,
                degreeLevel: payload.program.degreeLevel,
                fieldOfStudy: payload.program.fieldOfStudy,
                officialUrl: payload.program.officialUrl,
                teachingLanguage: payload.program.teachingLanguage,
                duration: payload.program.duration,
                published: true,
                requirementsComplete,
              },
              update: {
                published: true,
                officialUrl: payload.program.officialUrl,
                // Newly extracted values fill gaps; a missing value never erases a stored one.
                ...(payload.program.teachingLanguage
                  ? { teachingLanguage: payload.program.teachingLanguage }
                  : {}),
                ...(payload.program.duration
                  ? { duration: payload.program.duration }
                  : {}),
                ...(requirementsComplete ? { requirementsComplete: true } : {}),
              },
            })
          : null;
        if (options.replace && p) {
          await tx.admissionRequirement.deleteMany({
            where: { programId: p.id },
          });
          await tx.applicationIntake.deleteMany({ where: { programId: p.id } });
          await tx.costEstimate.deleteMany({ where: { programId: p.id } });
          await tx.requiredDocument.deleteMany({ where: { programId: p.id } });
          await tx.scholarshipEligibility.deleteMany({
            where: { programId: p.id },
          });
        }
        for (const r of payload.requirements) {
          // Explicit approval replaces matching condition labels only, retaining audit payloads and source versions.
          await tx.admissionRequirement.deleteMany({
            where: {
              programId: p!.id,
              requirementType: r.type,
              conditions: { path: ["label"], equals: r.label },
            },
          });
          const e = await evidence(r.excerpt, r.sourceUrl);
          await tx.admissionRequirement.create({
            data: {
              programId: p!.id,
              requirementType: r.type,
              conditions: ruleSchema.parse(r),
              thresholds: { minimum: r.minimum, scale: r.scale },
              applicableNationalities: r.appliesToNationalities,
              applicableQualifications: r.appliesToQualifications,
              verificationStatus: status,
              sourceEvidenceId: e.id,
            },
          });
        }
        for (const i of payload.intakes) {
          await tx.applicationIntake.deleteMany({
            where: {
              programId: p!.id,
              academicYear: i.academicYear,
              // The same entry year and deadline is one fact, whatever the page calls the term or route.
              OR: [
                { intakeTerm: i.term, applicationRoute: i.route },
                ...(i.deadline ? [{ deadline: new Date(i.deadline) }] : []),
              ],
            },
          });
          const e = await evidence(i.excerpt, i.sourceUrl);
          await tx.applicationIntake.create({
            data: {
              programId: p!.id,
              academicYear: i.academicYear,
              intakeTerm: i.term,
              applicationRoute: i.route,
              openDate: i.openDate,
              deadline: i.deadline,
              deadlineTimezone: i.timezone,
              verificationStatus: status,
              status: "PUBLISHED",
              sourceEvidenceId: e.id,
            },
          });
        }
        for (const c of payload.costs) {
          const e = await evidence(c.excerpt, c.sourceUrl);
          await tx.costEstimate.deleteMany({
            where: { programId: p!.id, currency: c.currency, period: c.period },
          });
          await tx.costEstimate.create({
            data: {
              universityId: doc.universityId,
              programId: p!.id,
              tuitionAmount: c.tuition,
              livingCostAmount: c.living,
              additionalCosts: c.other,
              currency: c.currency,
              period: c.period,
              verificationStatus: status,
              sourceEvidenceId: e.id,
            },
          });
        }
        for (const s of payload.scholarships) {
          const e = await evidence(s.excerpt, s.sourceUrl);
          const scholarship = await tx.scholarship.create({
            data: {
              name: s.name,
              provider: s.provider,
              officialUrl: s.officialUrl,
              degreeLevels: s.degreeLevels,
              nationalityRestrictions: s.nationalities,
              qualificationConditions: s.rules,
              tuitionCoverage: s.tuitionCoverage,
              stipendAmount: s.stipendAmount,
              stipendCurrency: s.currency,
              accommodationCoverage: s.accommodation,
              travelCoverage: s.travel,
              insuranceCoverage: s.insurance,
              applicationDeadline: s.deadline,
              renewalConditions: s.renewalConditions,
              fundingCategory: s.fundingCategory,
              verificationStatus: status,
              sourceEvidenceId: e.id,
            },
          });
          await tx.scholarshipEligibility.deleteMany({
            where: {
              universityId: doc.universityId,
              programId: p?.id ?? null,
              scholarship: { name: s.name },
            },
          });
          await tx.scholarshipEligibility.create({
            data: {
              scholarshipId: scholarship.id,
              universityId: doc.universityId,
              programId: p?.id ?? null,
              rules: s.rules,
            },
          });
        }
        for (const d of payload.documents) {
          const e = await evidence(d.excerpt, d.sourceUrl);
          await tx.requiredDocument.deleteMany({
            where: { programId: p!.id, documentType: d.name },
          });
          await tx.requiredDocument.create({
            data: {
              programId: p!.id,
              documentType: d.name,
              mandatory: d.mandatory,
              applicabilityRules: { text: d.applicability },
              sourceEvidenceId: e.id,
            },
          });
        }
      }
      if (action === "REJECT" && publishedBefore) {
        const unresolved = await tx.extractionCandidate.count({
          where: {
            id: { not: id },
            reviewedAt: null,
            job: { universityId: candidate.document.universityId },
            payload: {
              path: ["program", "title"],
              equals: payload.program!.title,
            },
          },
        });
        if (!unresolved) {
          // Explicit rejection resolves the new contradiction in favour of the
          // previously published values; preserve their original verification.
          const evidenceIds = [
            ...publishedBefore.requirements,
            ...publishedBefore.costs,
            ...publishedBefore.intakes,
          ]
            .map((f) => f.sourceEvidenceId)
            .filter((v): v is string => !!v);
          const evidence = await tx.sourceEvidence.findMany({
            where: { id: { in: evidenceIds } },
          });
          for (const e of evidence) {
            const restored = e.verifiedAt ? "ADMIN_VERIFIED" : "SOURCE_BACKED";
            await tx.admissionRequirement.updateMany({
              where: {
                programId: publishedBefore.id,
                sourceEvidenceId: e.id,
                verificationStatus: "CONFLICTING",
              },
              data: { verificationStatus: restored },
            });
            await tx.costEstimate.updateMany({
              where: {
                programId: publishedBefore.id,
                sourceEvidenceId: e.id,
                verificationStatus: "CONFLICTING",
              },
              data: { verificationStatus: restored },
            });
            await tx.applicationIntake.updateMany({
              where: {
                programId: publishedBefore.id,
                sourceEvidenceId: e.id,
                verificationStatus: "CONFLICTING",
              },
              data: { verificationStatus: restored },
            });
          }
        }
      }
      await tx.reviewRecord.create({
        data: {
          candidateId: id,
          action,
          administratorIdentity: administrator,
          previousValue,
          revisedValue: payload,
        },
      });
      await tx.extractionCandidate.update({
        where: { id },
        data: {
          payload,
          status: action === "APPROVE" ? status : "UNKNOWN",
          reviewedAt: new Date(),
        },
      });
      const remaining = await tx.extractionCandidate.count({
        where: { jobId: candidate.jobId, reviewedAt: null },
      });
      if (!remaining)
        await tx.researchJob.update({
          where: { id: candidate.jobId },
          data: { status: "COMPLETED", stage: "Completed" },
        });
      return { published: action === "APPROVE" };
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}
