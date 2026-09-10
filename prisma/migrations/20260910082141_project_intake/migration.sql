-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "candidateName" TEXT,
    "candidateEmail" TEXT,
    "jdText" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "jdVersion" INTEGER NOT NULL DEFAULT 1,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "ProjectMaterial" (
    "projectId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "ProjectMaterial_pkey" PRIMARY KEY ("projectId","materialId")
);

-- CreateTable
CREATE TABLE "ParseJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
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
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_workspaceId_createdAt_idx" ON "Project"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_createdBy_requestKey_key" ON "Project"("workspaceId", "createdBy", "requestKey");

-- CreateIndex
CREATE INDEX "Material_workspaceId_hash_idx" ON "Material"("workspaceId", "hash");

-- CreateIndex
CREATE INDEX "ParseJob_status_nextRunAt_idx" ON "ParseJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "ParseJob_projectId_inputVersion_idx" ON "ParseJob"("projectId", "inputVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_projectId_version_key" ON "Revision"("projectId", "version");

-- AddForeignKey
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMaterial" ADD CONSTRAINT "ProjectMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParseJob" ADD CONSTRAINT "ParseJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
