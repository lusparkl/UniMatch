import { db } from "../lib/db";
import { crawlSources } from "../lib/research/crawler";
import { allowedUrl } from "../lib/research/security";
import { squash } from "./curation";
// Freshness re-check without model calls: re-fetches every page cited by published facts through the guarded
// crawler (approved hosts, robots.txt, delay, SSRF checks). Unchanged bytes confirm the facts: lastCheckedAt is
// updated and stored OUTDATED rows backed by those bytes are restored, as the research pipeline does. A changed
// page is stored as a new version; evidence from older versions whose excerpt is still verbatim on it moves to
// the new version (the fact is reconfirmed), and evidence whose excerpt is gone stays on the old version and ages
// out until re-extracted. UNIVERSITIES=id,id limits the run. Dry run lists the pages; APPLY=1 fetches and writes.
const apply = process.env.APPLY === "1";
const only = process.env.UNIVERSITIES?.split(",").filter(Boolean);
const universities = await db.university.findMany({
  where: only ? { id: { in: only } } : {},
  include: { sources: true },
});
for (const u of universities) {
  const cited = await db.sourceEvidence.findMany({
    where: { document: { universityId: u.id } },
    select: { document: { select: { url: true } } },
    distinct: ["documentId"],
  });
  const urls = [...new Set(cited.map((e) => e.document.url))].filter((url) =>
    allowedUrl(url, u.sources),
  );
  console.log(`${u.id}: ${urls.length} cited pages on approved hosts`);
  if (!apply || !urls.length) continue;
  const policy = (url: string) =>
    u.sources.find((s) => s.startUrl === url) ?? {
      ...u.sources.find((s) => allowedUrl(url, [s]))!,
      startUrl: url,
    };
  const counts = { unchanged: 0, changed: 0, failed: 0, moved: 0, gone: 0 };
  const seen = new Set<string>();
  await crawlSources(
    urls.map(policy),
    async (d) => {
      seen.add(d.url);
      const latest = await db.sourceDocument.findFirst({
        where: { universityId: u.id, url: d.url },
        orderBy: { retrievedAt: "desc" },
      });
      const current =
        latest?.contentHash === d.contentHash
          ? await db.sourceDocument.update({
              where: { id: latest.id },
              data: { lastCheckedAt: new Date() },
            })
          : await db.sourceDocument.create({
              data: { ...d, universityId: u.id, previousVersionId: latest?.id },
            });
      if (current.id === latest?.id) counts.unchanged++;
      else counts.changed++;
      const page = squash(current.text);
      const evidence = await db.sourceEvidence.findMany({
        where: { document: { universityId: u.id, url: d.url } },
      });
      for (const e of evidence) {
        if (!page.includes(squash(e.excerpt))) {
          if (e.documentId !== current.id) counts.gone++;
          continue;
        }
        if (e.documentId !== current.id) {
          counts.moved++;
          const offset = current.text.indexOf(e.excerpt);
          await db.sourceEvidence.update({
            where: { id: e.id },
            data: {
              documentId: current.id,
              contentHash: current.contentHash,
              retrievedAt: current.retrievedAt,
              startOffset: offset >= 0 ? offset : null,
            },
          });
        }
        if (e.verificationStatus !== "OUTDATED") continue;
        const restored = e.verifiedAt ? "ADMIN_VERIFIED" : "SOURCE_BACKED";
        const where = {
          sourceEvidenceId: e.id,
          verificationStatus: "OUTDATED" as const,
        };
        const data = { verificationStatus: restored } as const;
        await db.sourceEvidence.update({ where: { id: e.id }, data });
        await db.admissionRequirement.updateMany({ where, data });
        await db.costEstimate.updateMany({ where, data });
        await db.applicationIntake.updateMany({ where, data });
        await db.scholarship.updateMany({ where, data });
      }
    },
    async (message) => {
      if (message.startsWith("FAILED")) {
        counts.failed++;
        console.log("   " + message);
      }
    },
    0,
  ).catch((error) => console.log("   " + String(error)));
  console.log(
    `   unchanged ${counts.unchanged}, changed ${counts.changed}, failed ${counts.failed}, not returned ${urls.filter((x) => !seen.has(x)).length - counts.failed}; evidence moved to the current version ${counts.moved}, quote gone ${counts.gone}`,
  );
}
process.exit(0);
