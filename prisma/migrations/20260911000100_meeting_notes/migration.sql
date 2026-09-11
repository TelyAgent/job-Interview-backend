CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewSession_round_check" CHECK ("round" BETWEEN 1 AND 100)
);

CREATE TABLE "RecordNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecordNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterviewSession_projectId_round_createdBy_key" ON "InterviewSession"("projectId", "round", "createdBy");
CREATE INDEX "InterviewSession_workspaceId_createdBy_idx" ON "InterviewSession"("workspaceId", "createdBy");
CREATE UNIQUE INDEX "RecordNote_sessionId_authorId_key" ON "RecordNote"("sessionId", "authorId");
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordNote" ADD CONSTRAINT "RecordNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
