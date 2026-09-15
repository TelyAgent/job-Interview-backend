-- CreateTable
CREATE TABLE "RubricVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceParseJobId" TEXT,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RubricVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityCard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "rubricVersionId" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "responsibilityType" TEXT NOT NULL,
    "cardPriority" TEXT NOT NULL,
    "competencyTags" TEXT NOT NULL,
    "expectedEvidence" TEXT NOT NULL,
    "levelAnchors" JSONB NOT NULL,
    "weight" INTEGER NOT NULL,
    "sourceRefs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapabilityCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RubricVersion_workspaceId_jobId_idx" ON "RubricVersion"("workspaceId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "RubricVersion_jobId_versionNumber_key" ON "RubricVersion"("jobId", "versionNumber");

-- CreateIndex
CREATE INDEX "CapabilityCard_rubricVersionId_idx" ON "CapabilityCard"("rubricVersionId");

-- AddForeignKey
ALTER TABLE "RubricVersion" ADD CONSTRAINT "RubricVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityCard" ADD CONSTRAINT "CapabilityCard_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
