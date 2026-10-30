-- Program-targeted extraction: remember which registered program and which source bundle a candidate came from.
ALTER TABLE "ExtractionCandidate" ADD COLUMN "programId" TEXT, ADD COLUMN "bundleHash" TEXT;
CREATE INDEX "ExtractionCandidate_programId_bundleHash_idx" ON "ExtractionCandidate"("programId", "bundleHash");
