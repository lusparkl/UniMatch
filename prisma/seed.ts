import { seedEvidence } from "./seed-evidence";
import { db } from "../lib/db";
import { curated } from "./curated";
import { seedRegistry } from "./registry";
try {
  for (const u of curated) {
    await db.university.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        name: u.name,
        country: u.country,
        city: u.city,
        officialWebsite: u.officialWebsite,
      },
      update: {},
    });
    await db.degreeProgram.upsert({
      where: { id: u.id + "-cs" },
      create: {
        id: u.id + "-cs",
        universityId: u.id,
        title: u.title,
        degreeLevel: u.degreeLevel,
        fieldOfStudy: "Computer Science",
        officialUrl: u.url,
        published: true,
        requirementsComplete: false,
      },
      update: {},
    });
    for (const [url, purpose] of [
      [u.url, "admissions"],
      [u.funding, "scholarship"],
    ]) {
      await db.approvedSource.upsert({
        where: { universityId_startUrl: { universityId: u.id, startUrl: url } },
        create: {
          universityId: u.id,
          startUrl: url,
          hostname: new URL(url).hostname,
          purpose,
          allowSubdomains: false,
        },
        update: {},
      });
    }
  }
  await seedEvidence();
  await seedRegistry();
  console.log(
    "Seeded 10 real institutions and program discovery records. A dated Debrecen source snapshot supplies tuition and two manual-review conditions; other requirements and costs remain unknown. No fictional records were inserted.",
  );
} finally {
  await db.$disconnect();
}
