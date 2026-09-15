-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "level" TEXT,
    "jdText" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "jdVersion" INTEGER NOT NULL DEFAULT 1,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "recruitingStatus" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "parsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "resumeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "matchScore" INTEGER,
    "matchRecommendation" TEXT,
    "screeningHandedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "readStatus" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMaterial" (
    "jobId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "JobMaterial_pkey" PRIMARY KEY ("jobId","materialId")
);

-- CreateTable
CREATE TABLE "TaskMaterial" (
    "taskId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "TaskMaterial_pkey" PRIMARY KEY ("taskId","materialId")
);

-- CreateTable
CREATE TABLE "ParseJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobId" TEXT,
    "resumeId" TEXT,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "materialId" TEXT,
    "inputVersion" INTEGER NOT NULL,
    "input" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" TEXT,
    "result" JSONB,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT 'intake-v1',
    "usage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParseJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "taskId" TEXT,
    "actorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_workspaceId_createdAt_idx" ON "Job"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_workspaceId_createdBy_requestKey_key" ON "Job"("workspaceId", "createdBy", "requestKey");

-- CreateIndex
CREATE INDEX "Candidate_workspaceId_createdAt_idx" ON "Candidate"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_materialId_key" ON "Resume"("materialId");

-- CreateIndex
CREATE INDEX "Resume_workspaceId_candidateId_idx" ON "Resume"("workspaceId", "candidateId");

-- CreateIndex
CREATE INDEX "InterviewTask_workspaceId_createdAt_idx" ON "InterviewTask"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "InterviewTask_jobId_idx" ON "InterviewTask"("jobId");

-- CreateIndex
CREATE INDEX "InterviewTask_candidateId_idx" ON "InterviewTask"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewTask_jobId_candidateId_key" ON "InterviewTask"("jobId", "candidateId");

-- CreateIndex
CREATE INDEX "Material_workspaceId_hash_idx" ON "Material"("workspaceId", "hash");

-- CreateIndex
CREATE INDEX "ParseJob_status_nextRunAt_idx" ON "ParseJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "ParseJob_jobId_inputVersion_idx" ON "ParseJob"("jobId", "inputVersion");

-- CreateIndex
CREATE INDEX "ParseJob_resumeId_inputVersion_idx" ON "ParseJob"("resumeId", "inputVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_jobId_version_key" ON "Revision"("jobId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_taskId_version_key" ON "Revision"("taskId", "version");

-- CreateIndex
CREATE INDEX "InterviewSession_workspaceId_createdBy_idx" ON "InterviewSession"("workspaceId", "createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSession_taskId_round_createdBy_key" ON "InterviewSession"("taskId", "round", "createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "RecordNote_sessionId_authorId_key" ON "RecordNote"("sessionId", "authorId");

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTask" ADD CONSTRAINT "InterviewTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTask" ADD CONSTRAINT "InterviewTask_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTask" ADD CONSTRAINT "InterviewTask_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMaterial" ADD CONSTRAINT "JobMaterial_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMaterial" ADD CONSTRAINT "JobMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMaterial" ADD CONSTRAINT "TaskMaterial_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InterviewTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMaterial" ADD CONSTRAINT "TaskMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParseJob" ADD CONSTRAINT "ParseJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParseJob" ADD CONSTRAINT "ParseJob_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParseJob" ADD CONSTRAINT "ParseJob_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InterviewTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InterviewTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InterviewTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordNote" ADD CONSTRAINT "RecordNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
