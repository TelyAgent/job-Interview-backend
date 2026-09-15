-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "rubricVersionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "situationPrompt" TEXT NOT NULL,
    "taskPrompt" TEXT NOT NULL,
    "actionPrompt" TEXT NOT NULL,
    "resultPrompt" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "sourceParseJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_cardId_key" ON "InterviewQuestion"("cardId");

-- CreateIndex
CREATE INDEX "InterviewQuestion_rubricVersionId_idx" ON "InterviewQuestion"("rubricVersionId");

-- CreateIndex
CREATE INDEX "InterviewQuestion_sourceParseJobId_idx" ON "InterviewQuestion"("sourceParseJobId");

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_rubricVersionId_fkey" FOREIGN KEY ("rubricVersionId") REFERENCES "RubricVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CapabilityCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
