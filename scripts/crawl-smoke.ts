import { crawlSources } from "../lib/research/crawler";
import { db } from "../lib/db";
if (process.env.LIVE_CRAWL_TEST !== "1")
  throw new Error("Opt in with LIVE_CRAWL_TEST=1; no OpenAI calls are made.");
process.env.MAX_CRAWL_PAGES = "1";
try {
  const universities = await db.university.findMany({
    include: { sources: true },
  });
  for (const u of universities) {
    if (
      process.env.CRAWL_UNIVERSITY_IDS &&
      !process.env.CRAWL_UNIVERSITY_IDS.split(",").includes(u.id)
    )
      continue;
    const source = u.sources.find(
      (s) => s.purpose === (process.env.CRAWL_PURPOSE ?? "admissions"),
    );
    if (!source) continue;
    try {
      await crawlSources(
        [source],
        async (d) => {
          await db.sourceDocument.upsert({
            where: {
              universityId_url_contentHash: {
                universityId: u.id,
                url: d.url,
                contentHash: d.contentHash,
              },
            },
            create: { ...d, universityId: u.id },
            update: { lastCheckedAt: new Date() },
          });
          console.log(
            JSON.stringify({
              university: u.name,
              url: d.url,
              title: d.title,
              characters: d.text.length,
              hash: d.contentHash,
            }),
          );
        },
        async (message) => {
          console.log(u.id + ": " + message);
        },
      );
    } catch (error) {
      console.error(u.id + ": " + String(error));
    }
  }
} finally {
  await db.$disconnect();
}
