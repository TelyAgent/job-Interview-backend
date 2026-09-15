import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { attachTaskMaterialSchema, createTaskSchema, reviewTaskSchema, validate } from './contracts';
import { CandidatesService } from './candidates.service';
import type { Identity } from './workspace.guard';

@Injectable()
export class TasksService {
  constructor(private readonly db: PrismaService, private readonly candidates: CandidatesService) {}

  /** Links one more résumé to an existing Job — the "link candidate" action. */
  async create(identity: Identity, jobId: string, raw: unknown) {
    const input = validate(createTaskSchema, raw);
    const job = await this.db.job.findFirst({ where: { id: jobId, workspaceId: identity.workspaceId } });
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND' });
    const material = await this.db.material.findFirst({ where: { id: input.materialId, workspaceId: identity.workspaceId } });
    if (!material) throw new NotFoundException({ code: 'NOT_FOUND' });
    if (material.readStatus !== 'available') throw new BadRequestException({ code: 'MATERIAL_NOT_AVAILABLE' });
    try {
      const taskId = await this.db.$transaction(async (tx) => {
        const { candidateId, resumeId } = await this.candidates.findOrCreateFromResume(tx, identity.workspaceId, material);
        const task = await tx.interviewTask.create({ data: {
          workspaceId: identity.workspaceId, createdBy: identity.actorId, jobId, candidateId, resumeId,
        } });
        return task.id;
      });
      return this.get(identity.workspaceId, taskId);
    } catch (error) {
      // A Postgres transaction aborts entirely on the first error, so recovering the
      // existing task (rather than creating a duplicate) has to happen in a fresh query,
      // not inside the same transaction — mirrors JobsService.create's retry-outside pattern.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const resume = await this.db.resume.findUniqueOrThrow({ where: { materialId: material.id } });
        const existing = await this.db.interviewTask.findUniqueOrThrow({ where: { jobId_candidateId: { jobId, candidateId: resume.candidateId } } });
        return this.get(identity.workspaceId, existing.id);
      }
      throw error;
    }
  }

  /** Flat, candidate-centric list backing the "Task list" home view — one row per (Job, Candidate). */
  list(workspaceId: string) {
    return this.db.interviewTask.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 200,
      select: {
        id: true, jobId: true, status: true, reviewed: true, version: true,
        matchScore: true, matchRecommendation: true, createdAt: true,
        job: { select: { title: true } },
        candidate: { select: { id: true, name: true, email: true } },
      } });
  }

  async get(workspaceId: string, id: string) {
    const task = await this.db.interviewTask.findFirst({ where: { id, workspaceId }, include: {
      job: { select: { id: true, title: true, department: true, location: true, level: true, jdText: true, jdVersion: true } },
      candidate: { select: { id: true, name: true, email: true, phone: true } },
      resume: { include: { material: { select: { id: true, name: true, text: true, segments: true, readStatus: true, errorCode: true } } } },
      materials: { include: { material: { select: { id: true, name: true, text: true, segments: true, readStatus: true, errorCode: true } } } },
      parseJobs: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, materialId: true, inputVersion: true, status: true, errorCode: true, result: true, attempt: true } },
    } });
    if (!task) throw new NotFoundException({ code: 'NOT_FOUND' });
    return task;
  }

  async review(identity: Identity, id: string, raw: unknown) {
    const input = validate(reviewTaskSchema, raw);
    await this.get(identity.workspaceId, id);
    await this.db.$transaction(async (tx) => {
      const updated = await tx.interviewTask.updateMany({ where: { id, workspaceId: identity.workspaceId, version: input.version },
        data: { status: input.status, reviewed: true, version: { increment: 1 } } });
      if (!updated.count) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      await tx.revision.create({ data: { taskId: id, actorId: identity.actorId, version: input.version + 1, payload: { ...input, action: 'reviewed' } } });
    });
    return this.get(identity.workspaceId, id);
  }

  async attach(identity: Identity, id: string, raw: unknown) {
    const input = validate(attachTaskMaterialSchema, raw);
    await this.get(identity.workspaceId, id);
    const material = await this.db.material.findFirst({ where: { id: input.materialId, workspaceId: identity.workspaceId } });
    if (!material) throw new NotFoundException({ code: 'NOT_FOUND' });
    await this.db.taskMaterial.upsert({
      where: { taskId_materialId: { taskId: id, materialId: material.id } }, update: {},
      create: { taskId: id, materialId: material.id, kind: input.kind },
    });
    return this.get(identity.workspaceId, id);
  }
}
