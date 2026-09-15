import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { validate } from '../intake/contracts';
import type { Identity } from '../intake/workspace.guard';
import { PrismaService } from '../persistence/prisma.service';

const sessionInput = z.object({ round: z.number().int().min(1).max(100) }).strict();
const noteInput = z.object({ version: z.number().int().min(0), content: z.string().max(50000) }).strict();

@Injectable()
export class MeetingRecordsService {
  constructor(private readonly db: PrismaService) {}

  tasks(identity: Identity) {
    // The development identity has no shared-task ACL yet: restrict to its own tasks.
    return this.db.interviewTask.findMany({
      where: { workspaceId: identity.workspaceId, createdBy: identity.actorId },
      select: { id: true, job: { select: { title: true } }, candidate: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  async create(identity: Identity, taskId: string, raw: unknown) {
    const { round } = validate(sessionInput, raw);
    const task = await this.db.interviewTask.findFirst({ where: { id: taskId, workspaceId: identity.workspaceId, createdBy: identity.actorId } });
    if (!task) throw new NotFoundException({ code: 'RECORD_NOT_FOUND' });
    const where = { taskId_round_createdBy: { taskId, round, createdBy: identity.actorId } };
    let session;
    try {
      session = await this.db.interviewSession.upsert({ where, update: {}, create: {
        taskId, workspaceId: identity.workspaceId, createdBy: identity.actorId, round,
      } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      session = await this.db.interviewSession.findUniqueOrThrow({ where });
    }
    return this.get(identity, session.id);
  }

  private async session(identity: Identity, id: string) {
    const session = await this.db.interviewSession.findFirst({ where: {
      id, workspaceId: identity.workspaceId, createdBy: identity.actorId,
      task: { workspaceId: identity.workspaceId, createdBy: identity.actorId },
    }, select: { id: true, taskId: true, round: true, task: { select: { job: { select: { title: true } }, candidate: { select: { name: true } } } } } });
    if (!session) throw new NotFoundException({ code: 'RECORD_NOT_FOUND' });
    return session;
  }

  async get(identity: Identity, id: string) {
    const session = await this.session(identity, id);
    const note = await this.db.recordNote.findUnique({ where: { sessionId_authorId: { sessionId: id, authorId: identity.actorId } },
      select: { content: true, version: true, updatedAt: true } });
    return { session, note: note || { content: '', version: 0, updatedAt: null },
      transcript: { status: 'unavailable', code: 'RTMS_NOT_CONNECTED' } };
  }

  async save(identity: Identity, id: string, raw: unknown) {
    const input = validate(noteInput, raw);
    await this.session(identity, id);
    const where = { sessionId_authorId: { sessionId: id, authorId: identity.actorId } };
    try {
      return await this.db.$transaction(async tx => {
        const existing = await tx.recordNote.findUnique({ where });
        // A lost HTTP response can be retried without creating a false conflict.
        if (existing?.version === input.version + 1 && existing.content === input.content) {
          return { content: existing.content, version: existing.version, updatedAt: existing.updatedAt };
        }
        if (!existing) {
          if (input.version !== 0) throw new ConflictException({ code: 'NOTE_VERSION_CONFLICT' });
          return tx.recordNote.create({ data: { sessionId: id, authorId: identity.actorId, content: input.content, version: 1 },
            select: { content: true, version: true, updatedAt: true } });
        }
        const updated = await tx.recordNote.updateMany({ where: { id: existing.id, version: input.version },
          data: { content: input.content, version: { increment: 1 } } });
        if (!updated.count) throw new ConflictException({ code: 'NOTE_VERSION_CONFLICT' });
        return tx.recordNote.findUniqueOrThrow({ where, select: { content: true, version: true, updatedAt: true } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.db.recordNote.findUnique({ where });
        if (existing?.version === input.version + 1 && existing.content === input.content) {
          return { content: existing.content, version: existing.version, updatedAt: existing.updatedAt };
        }
        throw new ConflictException({ code: 'NOTE_VERSION_CONFLICT' });
      }
      throw error;
    }
  }
}
