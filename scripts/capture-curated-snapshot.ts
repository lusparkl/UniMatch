// Maintainer-only: capture a tiny reproducible seed from bytes already fetched by
// the guarded crawler. This never makes a model call and never asserts human approval.
import { writeFile } from "node:fs/promises";
import { db } from "../lib/db";
import { createHash } from "node:crypto";
try {
  const doc = await db.sourceDocument.findFirstOrThrow({
    where: { universityId: "debrecen", documentType: "HTML" },
    orderBy: { retrievedAt: "desc" },
  });
  const excerpts = [
    "The tuition fee for this program is 7,000 USD/Year",
    "B2 level English proficiency",
    "a written and oral entrance exam in Mathematics",
  ];
  for (const excerpt of excerpts)
    if (!doc.text.includes(excerpt))
      throw new Error(
        "Source no longer contains expected excerpt; manual review required.",
      );
  const text = excerpts.join("\n");
  await writeFile(
    "prisma/curated-evidence.json",
    JSON.stringify(
      {
        universityId: "debrecen",
        programId: "debrecen-cs",
        url: doc.url,
        title: doc.title,
        text,
        contentHash: createHash("sha256").update(text).digest("hex"),
        originalDocumentHash: doc.contentHash,
        retrievedAt: doc.retrievedAt.toISOString(),
        excerpts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Captured source-backed excerpts; not administrator-verified.");
} finally {
  await db.$disconnect();
}
