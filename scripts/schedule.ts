import { db } from "../lib/db";
import { positive } from "../lib/config";
import { enqueueResearch } from "../lib/queue";
if (!process.env.OPENAI_API_KEY)
  throw new Error(
    "Scheduled research disabled: OPENAI_API_KEY is not configured",
  );
const days = {
  deadline: positive("FRESHNESS_DEADLINE_DAYS", 7),
  scholarship: positive("FRESHNESS_SCHOLARSHIP_DAYS", 30),
  metadata: positive("FRESHNESS_METADATA_DAYS", 90),
  admissions: positive("FRESHNESS_SCHOLARSHIP_DAYS", 30),
};
try {
  const universities = await db.university.findMany({
    include: {
      sources: true,
      documents: { orderBy: { lastCheckedAt: "desc" } },
    },
  });
  for (const u of universities) {
    const stale = u.sources.filter((s) => {
      const doc = u.documents.find((d) => d.url === s.startUrl);
      return (
        !doc ||
        Date.now() - doc.lastCheckedAt.getTime() >
          (days[s.purpose as keyof typeof days] ?? 30) * 86400000
      );
    });
    if (!stale.length) continue;
    // Stale evidence stops contributing definitive eligibility until reconfirmed.
    const old = u.documents.filter(
      (d) =>
        Date.now() - d.lastCheckedAt.getTime() >
        Math.min(
          ...stale.map((s) => days[s.purpose as keyof typeof days] ?? 30),
        ) *
          86400000,
    );
    for (const doc of old) {
      await db.sourceEvidence.updateMany({
        where: { documentId: doc.id },
        data: { verificationStatus: "OUTDATED" },
      });
      await db.admissionRequirement.updateMany({
        where: { evidence: { documentId: doc.id } },
        data: { verificationStatus: "OUTDATED" },
      });
      await db.costEstimate.updateMany({
        where: { evidence: { documentId: doc.id } },
        data: { verificationStatus: "OUTDATED" },
      });
      await db.applicationIntake.updateMany({
        where: { evidence: { documentId: doc.id } },
        data: { verificationStatus: "OUTDATED" },
      });
      await db.scholarship.updateMany({
        where: { evidence: { documentId: doc.id } },
        data: { verificationStatus: "OUTDATED" },
      });
    }
    try {
      const job = await enqueueResearch(
        u.id,
        stale.map((s) => s.purpose),
      );
      console.log(u.name + ": queued " + job.id);
    } catch (e) {
      console.log(u.name + ": " + String(e));
    }
  }
} finally {
  await db.$disconnect();
}
