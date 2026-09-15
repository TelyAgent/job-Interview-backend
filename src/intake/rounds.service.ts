import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { createRoundSchema, updateRoundSchema, validate } from './contracts';

const ROUND_SELECT = {
  id: true, taskId: true, sequence: true, name: true, format: true, duration: true,
  competencies: true, questions: true, mandatory: true, notes: true, status: true, version: true,
  createdAt: true, interviewer: { select: { id: true, name: true, title: true } },
} satisfies Prisma.InterviewRoundSelect;

@Injectable()
export class RoundsService {
  constructor(private readonly db: PrismaService) {}

  /** Every task gets two generic rounds the moment it exists — content is filled in later. */
  async createDefaultRounds(tx: Prisma.TransactionClient, workspaceId: string, taskId: string) {
    for (const sequence of [1, 2]) {
      await tx.interviewRound.create({ data: {
        workspaceId, taskId, sequence, name: `Round ${sequence}`, format: 'Onsite panel', duration: 45,
        competencies: '', questions: 3, mandatory: 2, notes: '',
      } });
    }
  }

  async listForTask(workspaceId: string, taskId: string) {
    await this.getTask(workspaceId, taskId);
    return this.db.interviewRound.findMany({ where: { taskId, workspaceId }, orderBy: { sequence: 'asc' }, select: ROUND_SELECT });
  }

  async createForTask(identity: { workspaceId: string }, taskId: string, raw: unknown) {
    const input = validate(createRoundSchema, raw);
    await this.getTask(identity.workspaceId, taskId);
    if (input.interviewerId) await this.getInterviewer(identity.workspaceId, input.interviewerId);
    const questions = input.questions ?? 3;
    const mandatory = Math.min(questions, input.mandatory ?? 2);
    const round = await this.db.$transaction(async (tx) => {
      const last = await tx.interviewRound.findFirst({ where: { taskId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
      const sequence = (last?.sequence ?? 0) + 1;
      return tx.interviewRound.create({ data: {
        workspaceId: identity.workspaceId, taskId, sequence,
        name: input.name?.trim() || `Round ${sequence}`,
        format: input.format || 'Video interview',
        duration: input.duration ?? 45,
        competencies: input.competencies ?? '',
        questions, mandatory,
        notes: input.notes ?? '',
        interviewerId: input.interviewerId ?? null,
      }, select: ROUND_SELECT });
    });
    return round;
  }

  async update(identity: { workspaceId: string }, roundId: string, raw: unknown) {
    const input = validate(updateRoundSchema, raw);
    const existing = await this.db.interviewRound.findFirst({ where: { id: roundId, workspaceId: identity.workspaceId } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND' });
    if (input.interviewerId) await this.getInterviewer(identity.workspaceId, input.interviewerId);
    const mandatory = Math.min(input.questions, input.mandatory);
    const updated = await this.db.interviewRound.updateMany({
      where: { id: roundId, workspaceId: identity.workspaceId, version: input.version },
      data: {
        name: input.name, format: input.format, duration: input.duration, competencies: input.competencies,
        questions: input.questions, mandatory, notes: input.notes, status: input.status,
        interviewerId: input.interviewerId, version: { increment: 1 },
      },
    });
    if (!updated.count) throw new ConflictException({ code: 'VERSION_CONFLICT' });
    return this.db.interviewRound.findUniqueOrThrow({ where: { id: roundId }, select: ROUND_SELECT });
  }

  private async getTask(workspaceId: string, taskId: string) {
    const task = await this.db.interviewTask.findFirst({ where: { id: taskId, workspaceId } });
    if (!task) throw new NotFoundException({ code: 'NOT_FOUND' });
    return task;
  }

  private async getInterviewer(workspaceId: string, interviewerId: string) {
    const interviewer = await this.db.interviewer.findFirst({ where: { id: interviewerId, workspaceId } });
    if (!interviewer) throw new BadRequestException({ code: 'INTERVIEWER_NOT_FOUND' });
    return interviewer;
  }
}
