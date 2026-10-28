CREATE UNIQUE INDEX "ResearchJob_one_active_per_university" ON "ResearchJob" ("universityId") WHERE "status" IN ('QUEUED','RUNNING','RETRYING');
