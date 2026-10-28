-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('SOURCE_BACKED', 'NEEDS_REVIEW', 'ADMIN_VERIFIED', 'CONFLICTING', 'OUTDATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DegreeLevel" AS ENUM ('BACHELOR', 'MASTER');

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "officialWebsite" TEXT NOT NULL,
    "researchStatus" TEXT NOT NULL DEFAULT 'NOT_RESEARCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedSource" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "startUrl" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'admissions',
    "allowSubdomains" BOOLEAN NOT NULL DEFAULT false,
    "browserRendering" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ApprovedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DegreeProgram" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "degreeLevel" "DegreeLevel" NOT NULL,
    "fieldOfStudy" TEXT NOT NULL,
    "teachingLanguage" TEXT,
    "duration" TEXT,
    "officialUrl" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "requirementsComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DegreeProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationIntake" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "intakeTerm" TEXT NOT NULL,
    "applicationRoute" TEXT NOT NULL,
    "openDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "deadlineTimezone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "sourceEvidenceId" TEXT,

    CONSTRAINT "ApplicationIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionRequirement" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "intakeId" TEXT,
    "requirementType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "applicableNationalities" TEXT[],
    "applicableQualifications" TEXT[],
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "sourceEvidenceId" TEXT NOT NULL,

    CONSTRAINT "AdmissionRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scholarship" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "officialUrl" TEXT NOT NULL,
    "degreeLevels" "DegreeLevel"[],
    "nationalityRestrictions" TEXT[],
    "qualificationConditions" JSONB NOT NULL,
    "tuitionCoverage" DOUBLE PRECISION,
    "stipendAmount" DOUBLE PRECISION,
    "stipendCurrency" VARCHAR(3),
    "accommodationCoverage" TEXT,
    "travelCoverage" TEXT,
    "insuranceCoverage" TEXT,
    "applicationDeadline" TIMESTAMP(3),
    "renewalConditions" TEXT,
    "fundingCategory" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "sourceEvidenceId" TEXT NOT NULL,

    CONSTRAINT "Scholarship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScholarshipEligibility" (
    "id" TEXT NOT NULL,
    "scholarshipId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "programId" TEXT,
    "rules" JSONB NOT NULL,

    CONSTRAINT "ScholarshipEligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEstimate" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "programId" TEXT,
    "tuitionAmount" DOUBLE PRECISION,
    "livingCostAmount" DOUBLE PRECISION,
    "additionalCosts" DOUBLE PRECISION,
    "currency" VARCHAR(3) NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'ANNUAL',
    "estimateType" TEXT NOT NULL DEFAULT 'ESTIMATE',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "sourceEvidenceId" TEXT NOT NULL,

    CONSTRAINT "CostEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequiredDocument" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "intakeId" TEXT,
    "documentType" TEXT NOT NULL,
    "applicabilityRules" JSONB NOT NULL,
    "mandatory" BOOLEAN NOT NULL,
    "sourceEvidenceId" TEXT NOT NULL,

    CONSTRAINT "RequiredDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedAt" TIMESTAMP(3),
    "previousVersionId" TEXT,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceEvidence" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "startOffset" INTEGER,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "contentHash" TEXT NOT NULL,
    "relevantAcademicYear" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'SOURCE_BACKED',

    CONSTRAINT "SourceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "targets" TEXT[],
    "stage" TEXT NOT NULL DEFAULT 'Queued',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "modelCalls" INTEGER NOT NULL DEFAULT 0,
    "tokenUsage" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[],

    CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "ResearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionCandidate" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "issues" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ExtractionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRecord" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousValue" JSONB NOT NULL,
    "revisedValue" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "administratorIdentity" TEXT NOT NULL,

    CONSTRAINT "ReviewRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "administratorIdentity" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelUsage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovedSource_universityId_startUrl_key" ON "ApprovedSource"("universityId", "startUrl");

-- CreateIndex
CREATE UNIQUE INDEX "DegreeProgram_universityId_title_degreeLevel_key" ON "DegreeProgram"("universityId", "title", "degreeLevel");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_universityId_url_contentHash_key" ON "SourceDocument"("universityId", "url", "contentHash");

-- AddForeignKey
ALTER TABLE "ApprovedSource" ADD CONSTRAINT "ApprovedSource_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DegreeProgram" ADD CONSTRAINT "DegreeProgram_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIntake" ADD CONSTRAINT "ApplicationIntake_programId_fkey" FOREIGN KEY ("programId") REFERENCES "DegreeProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationIntake" ADD CONSTRAINT "ApplicationIntake_sourceEvidenceId_fkey" FOREIGN KEY ("sourceEvidenceId") REFERENCES "SourceEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequirement" ADD CONSTRAINT "AdmissionRequirement_programId_fkey" FOREIGN KEY ("programId") REFERENCES "DegreeProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequirement" ADD CONSTRAINT "AdmissionRequirement_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "ApplicationIntake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdmissionRequirement" ADD CONSTRAINT "AdmissionRequirement_sourceEvidenceId_fkey" FOREIGN KEY ("sourceEvidenceId") REFERENCES "SourceEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scholarship" ADD CONSTRAINT "Scholarship_sourceEvidenceId_fkey" FOREIGN KEY ("sourceEvidenceId") REFERENCES "SourceEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScholarshipEligibility" ADD CONSTRAINT "ScholarshipEligibility_scholarshipId_fkey" FOREIGN KEY ("scholarshipId") REFERENCES "Scholarship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScholarshipEligibility" ADD CONSTRAINT "ScholarshipEligibility_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScholarshipEligibility" ADD CONSTRAINT "ScholarshipEligibility_programId_fkey" FOREIGN KEY ("programId") REFERENCES "DegreeProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "DegreeProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEstimate" ADD CONSTRAINT "CostEstimate_sourceEvidenceId_fkey" FOREIGN KEY ("sourceEvidenceId") REFERENCES "SourceEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequiredDocument" ADD CONSTRAINT "RequiredDocument_programId_fkey" FOREIGN KEY ("programId") REFERENCES "DegreeProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequiredDocument" ADD CONSTRAINT "RequiredDocument_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "ApplicationIntake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequiredDocument" ADD CONSTRAINT "RequiredDocument_sourceEvidenceId_fkey" FOREIGN KEY ("sourceEvidenceId") REFERENCES "SourceEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceEvidence" ADD CONSTRAINT "SourceEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchLog" ADD CONSTRAINT "ResearchLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCandidate" ADD CONSTRAINT "ExtractionCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionCandidate" ADD CONSTRAINT "ExtractionCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRecord" ADD CONSTRAINT "ReviewRecord_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ExtractionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

