import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { PrismaService } from '../persistence/prisma.service';
import type { ParseInput } from '../intake/contracts';
import { buildCardSegment, questionGenerationSchema } from './contracts';

const QUESTION_SELECT = {
  id: true, cardId: true, situationPrompt: true, taskPrompt: true, actionPrompt: true, resultPrompt: true,
  mandatory: true, createdAt: true,
  card: { select: { id: true, requirement: true, responsibilityType: true, cardPriority: true, competencyTags: true, expectedEvidence: true } },
} satisfies Prisma.InterviewQuestionSelect;

@Injectable()
export class BriefService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Entry point for the whole capability — usable for any Job with a confirmed rubric,
   * regardless of how the task reached this workspace. Idempotent per rubric version
   * number, same generate/materialize pattern as the rubric module's own generation.
   */
  async generate(workspaceId: string, jobId: string) {
    await this.getJob(workspaceId, jobId);
    const confirmed = await this.findConfirmedRubric(workspaceId, jobId);
    if (!confirmed) throw new ConflictException({ code: 'RUBRIC_NOT_CONFIRMED' });
    if (!confirmed.cards.length) throw new BadRequestException({ code: 'NO_CAPABILITY_CARDS' });
    const existing = await this.db.parseJob.findFirst({
      where: { jobId, workspaceId, type: 'brief_questions', inputVersion: confirmed.versionNumber, status: { not: 'failed' } },
    });
    if (existing) return existing;
    const input: ParseInput = { sourceId: `rubric:${confirmed.id}`, segments: confirmed.cards.map(buildCardSegment) };
    return this.db.parseJob.create({ data: {
      jobId, workspaceId, type: 'brief_questions', inputVersion: confirmed.versionNumber,
      input: input as unknown as Prisma.InputJsonValue,
    } });
  }

  /**
   * Returns the current generation status plus every STAR question set generated so far
   * for the job's latest confirmed rubric version, materializing a just-finished AI draft
   * into persisted rows the first time it is read.
   */
  async getQuestions(workspaceId: string, jobId: string) {
    await this.getJob(workspaceId, jobId);
    const confirmed = await this.findConfirmedRubric(workspaceId, jobId);
    if (!confirmed) return { jobId, rubricVersionId: null, versionNumber: null, generation: null, questions: [] };
    await this.materializeIfReady(workspaceId, confirmed);
    const questions = await this.db.interviewQuestion.findMany({
      where: { rubricVersionId: confirmed.id }, orderBy: { createdAt: 'asc' }, select: QUESTION_SELECT,
    });
    const generationJob = await this.db.parseJob.findFirst({
      where: { jobId, workspaceId, type: 'brief_questions', inputVersion: confirmed.versionNumber },
      orderBy: { createdAt: 'desc' }, select: { id: true, status: true, errorCode: true },
    });
    return {
      jobId, rubricVersionId: confirmed.id, versionNumber: confirmed.versionNumber,
      generation: generationJob ? { id: generationJob.id, status: generationJob.status, errorCode: generationJob.errorCode } : null,
      questions,
    };
  }

  // Turns a completed `brief_questions` ParseJob into persisted InterviewQuestion rows
  // the first time anyone reads it. Keyed by `sourceParseJobId` so a concurrent read never
  // double-materializes the same AI draft; `cardId` is unique so a regenerate for the same
  // confirmed version updates each card's question set in place rather than duplicating it.
  private async materializeIfReady(
    workspaceId: string,
    confirmed: { id: string; jobId: string; versionNumber: number; cards: { id: string; cardPriority: string }[] },
  ) {
    const ready = await this.db.parseJob.findFirst({
      where: { jobId: confirmed.jobId, workspaceId, type: 'brief_questions', inputVersion: confirmed.versionNumber, status: 'needs_review' },
      orderBy: { createdAt: 'desc' },
    });
    if (!ready) return;
    const already = await this.db.interviewQuestion.findFirst({ where: { sourceParseJobId: ready.id } });
    if (already) return;
    const result = ready.result as unknown as z.infer<typeof questionGenerationSchema>;
    const cardsById = new Map(confirmed.cards.map((c) => [c.id, c]));
    const rows = result.questions.filter((q) => cardsById.has(q.segmentId));
    if (!rows.length) return;
    await this.db.$transaction(async (tx) => {
      const race = await tx.interviewQuestion.findFirst({ where: { sourceParseJobId: ready.id } });
      if (race) return;
      for (const q of rows) {
        const card = cardsById.get(q.segmentId)!;
        const data = {
          workspaceId, rubricVersionId: confirmed.id, cardId: q.segmentId,
          situationPrompt: q.situationPrompt, taskPrompt: q.taskPrompt, actionPrompt: q.actionPrompt, resultPrompt: q.resultPrompt,
          mandatory: card.cardPriority === 'P0', sourceParseJobId: ready.id,
        };
        await tx.interviewQuestion.upsert({ where: { cardId: q.segmentId }, create: data, update: data });
      }
    });
  }

  private async getJob(workspaceId: string, jobId: string) {
    const job = await this.db.job.findFirst({ where: { id: jobId, workspaceId }, select: { id: true } });
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND' });
    return job;
  }

  private async findConfirmedRubric(workspaceId: string, jobId: string) {
    return this.db.rubricVersion.findFirst({
      where: { workspaceId, jobId, status: 'confirmed' },
      orderBy: { versionNumber: 'desc' },
      include: { cards: { orderBy: { createdAt: 'asc' } } },
    });
  }
}
