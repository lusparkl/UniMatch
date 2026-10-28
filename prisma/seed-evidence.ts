import { db } from "../lib/db";
import snapshot from "./curated-evidence.json";
export async function seedEvidence() {
  const id = "curated-debrecen-source";
  const doc = await db.sourceDocument.upsert({
    where: { id },
    create: {
      id,
      universityId: snapshot.universityId,
      url: snapshot.url,
      title: snapshot.title,
      text: snapshot.text,
      contentHash: snapshot.contentHash,
      documentType: "CURATED_EXCERPTS",
      retrievedAt: new Date(snapshot.retrievedAt),
      lastCheckedAt: new Date(snapshot.retrievedAt),
    },
    update: {},
  });
  for (const [i, excerpt] of snapshot.excerpts.entries()) {
    await db.sourceEvidence.upsert({
      where: { id: "curated-debrecen-evidence-" + i },
      create: {
        id: "curated-debrecen-evidence-" + i,
        documentId: doc.id,
        url: doc.url,
        title: doc.title,
        excerpt,
        retrievedAt: doc.retrievedAt,
        contentHash: doc.contentHash,
        startOffset: doc.text.indexOf(excerpt),
        verificationStatus: "SOURCE_BACKED",
      },
      update: {},
    });
  }
  if (
    !(await db.costEstimate.count({ where: { programId: snapshot.programId } }))
  )
    await db.costEstimate.create({
      data: {
        universityId: snapshot.universityId,
        programId: snapshot.programId,
        tuitionAmount: 7000,
        livingCostAmount: null,
        additionalCosts: null,
        currency: "USD",
        period: "ANNUAL",
        estimateType: "PUBLISHED_TUITION_ONLY",
        verificationStatus: "SOURCE_BACKED",
        sourceEvidenceId: "curated-debrecen-evidence-0",
      },
    });
  if (
    !(await db.admissionRequirement.count({
      where: { programId: snapshot.programId },
    }))
  )
    for (const [i, label] of [
      "B2 English proficiency — certificate equivalency needs review",
      "Written and oral Mathematics entrance exam",
    ].entries()) {
      await db.admissionRequirement.create({
        data: {
          programId: snapshot.programId,
          requirementType: "OTHER",
          conditions: {
            type: "OTHER",
            label,
            minimum: null,
            scale: null,
            allowed: [],
            mandatory: true,
            appliesToNationalities: [],
            appliesToQualifications: [],
          },
          thresholds: {},
          applicableNationalities: [],
          applicableQualifications: [],
          verificationStatus: "SOURCE_BACKED",
          sourceEvidenceId: "curated-debrecen-evidence-" + (i + 1),
        },
      });
    }
}
