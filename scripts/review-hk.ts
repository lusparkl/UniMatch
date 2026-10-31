import { db } from "../lib/db";
import { curate } from "../lib/research/curate";
import { extractionSchema } from "../lib/research/extraction";
import { institutionTeachingLanguage } from "../lib/research/relevance";
import { reviewCandidate } from "../lib/research/review";
// Delegated review of registry-program candidates: strict automatic curation, then publication as
// SOURCE_BACKED (a machine-checked citation), never ADMIN_VERIFIED. Run with APPLY=1 to write; REPLACE=1 also wipes the program's earlier facts first.
const apply = process.env.APPLY === "1";
const universities = (
  process.env.UNIVERSITIES ?? "hku,hkust,polyu,cuhk,hkbu"
).split(",");
// OWNER_APPROVED=1 records the project owner's explicit approval and publishes as ADMIN_VERIFIED.
const ownerApproved = process.env.OWNER_APPROVED === "1";
const reviewer = ownerApproved
  ? "project owner (explicit approval of the delegated review, 2026-10-31)"
  : "claude-code (delegated by project owner; automated evidence checks)";
try {
  for (const universityId of universities) {
    const stored = await db.sourceDocument.findMany({
      where: { universityId },
      orderBy: { retrievedAt: "desc" },
    });
    // Only the registered official pages count as evidence for a duration or a quote.
    const registered = new Set(
      (
        await db.approvedSource.findMany({
          where: { universityId, purpose: { startsWith: "registry" } },
        })
      ).map((s) => s.startUrl),
    );
    const pages = new Map<string, string>();
    for (const d of stored)
      if (registered.has(d.url) && !pages.has(d.url)) pages.set(d.url, d.text);
    const candidates = await db.extractionCandidate.findMany({
      where: {
        programId: { not: null },
        job: { universityId },
        status: "NEEDS_REVIEW",
        reviewedAt: null,
      },
      orderBy: { createdAt: "desc" },
      include: { job: true },
    });
    const seen = new Set<string>();
    for (const c of candidates) {
      if (seen.has(c.programId!)) continue;
      seen.add(c.programId!);
      const parsed = extractionSchema.safeParse(c.payload);
      if (!parsed.success) {
        console.log(universityId, c.id, "SKIP unparsable payload");
        continue;
      }
      const { payload, dropped } = curate(parsed.data, pages);
      if (payload.program && !payload.program.teachingLanguage) {
        const language = institutionTeachingLanguage(pages);
        if (language) {
          payload.program.teachingLanguage = language.language;
          dropped.push(
            `teaching language "${language.language}" from an institution-wide statement: "${language.sentence.slice(0, 160)}" (${language.url})`,
          );
        }
      }
      const counts = `req ${payload.requirements.length}/${parsed.data.requirements.length} intake ${payload.intakes.length}/${parsed.data.intakes.length} cost ${payload.costs.length}/${parsed.data.costs.length} doc ${payload.documents.length}/${parsed.data.documents.length}`;
      console.log(
        `\n${universityId} ${payload.program?.title} | dur=${payload.program?.duration} lang=${payload.program?.teachingLanguage} | ${counts}`,
      );
      for (const d of dropped) console.log("   -", d);
      if (process.env.VERBOSE === "1") {
        for (const r of payload.requirements)
          console.log(
            `   REQ ${r.type} min=${r.minimum} [${r.appliesToQualifications.join(",")}] ${r.label.slice(0, 60)}`,
          );
        for (const i of payload.intakes)
          console.log(
            `   INTAKE ${i.academicYear} ${i.term} | ${i.route} | open=${i.openDate?.slice(0, 10)} dl=${i.deadline?.slice(0, 10)}`,
          );
        for (const k of payload.scholarships)
          console.log(
            `   SCH ${k.name} cov=${k.tuitionCoverage} stip=${k.stipendAmount} ${k.fundingCategory} dl=${k.deadline?.slice(0, 10)} rules=${k.rules.length}`,
          );
        for (const k of payload.costs)
          console.log(
            `   COST t=${k.tuition} l=${k.living} o=${k.other} ${k.currency} ${k.period}`,
          );
      }
      if (!apply) continue;
      try {
        await reviewCandidate(c.id, "APPROVE", reviewer, payload, false, {
          status: ownerApproved ? "ADMIN_VERIFIED" : "SOURCE_BACKED",
          replace: process.env.REPLACE === "1",
        });
        console.log(
          "   APPROVED as",
          ownerApproved ? "ADMIN_VERIFIED" : "SOURCE_BACKED",
        );
      } catch (error) {
        console.log("   NOT APPROVED:", String(error).slice(0, 300));
      }
    }
  }
} finally {
  await db.$disconnect();
}
