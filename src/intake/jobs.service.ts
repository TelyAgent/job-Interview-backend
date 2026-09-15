import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../persistence/prisma.service';
import { createJobSchema, reviewJobSchema, validate, type ParseInput } from './contracts';
import { splitText } from './materials.service';
import { CandidatesService } from './candidates.service';
import type { Identity } from './workspace.guard';

@Injectable()
export class JobsService {
  constructor(private readonly db: PrismaService, private readonly candidates: CandidatesService) {}

  async create(identity: Identity, key: string | undefined, raw: unknown): Promise<Awaited<ReturnType<JobsService['get']>>> {
    if (!key || key.length > 100) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const input = validate(createJobSchema, raw);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = await this.db.job.findUnique({ where: { workspaceId_createdBy_requestKey: { workspaceId: identity.workspaceId, createdBy: identity.actorId, requestKey: key } } });
    if (existing) {
      if (existing.requestHash !== hash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
      return this.get(identity.workspaceId, existing.id);
    }
    const ids = [...input.resumes.map((r) => r.materialId), ...(input.jd.materialId ? [input.jd.materialId] : [])];
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: 'DUPLICATE_MATERIAL' });
    const materials = await this.db.material.findMany({ where: { id: { in: ids }, workspaceId: identity.workspaceId } });
    if (materials.length !== ids.length) throw new NotFoundException({ code: 'NOT_FOUND' });
    const jdMaterial = materials.find((m) => m.id === input.jd.materialId);
    const jdText = input.jd.effectiveSource === 'text' ? input.jd.text?.trim() || '' : jdMaterial?.text || '';
    if (!jdText && !jdMaterial) throw new BadRequestException({ code: 'JD_REQUIRED' });
    const jdInput: ParseInput = { sourceId: input.jd.effectiveSource === 'file' ? jdMaterial!.id : 'jd:1', segments: input.jd.effectiveSource === 'file' ? jdMaterial!.segments as unknown as ParseInput['segments'] : splitText(jdText) };
    const resumeMaterials = input.resumes.map((r) => materials.find((m) => m.id === r.materialId)!).filter((m) => m.readStatus === 'available');
    try {
      const jobId = await this.db.$transaction(async (tx) => {
        const job = await tx.job.create({ data: {
          workspaceId: identity.workspaceId, createdBy: identity.actorId, requestKey: key, requestHash: hash,
          title: jdText.split('\n')[0]?.slice(0, 200) || 'Untitled role', jdText,
          materials: jdMaterial ? { create: [{ materialId: jdMaterial.id, kind: 'jd' }] } : undefined,
          parseJobs: jdText ? { create: [{ workspaceId: identity.workspaceId, type: 'jd', inputVersion: 1, input: jdInput as unknown as Prisma.InputJsonValue }] } : undefined,
          revisions: { create: { actorId: identity.actorId, version: 1, payload: { action: 'created', jdText } } },
        } });
        // One JD can be matched against several résumés in the same call — each becomes
        // its own unique (job, candidate) task.
        for (const material of resumeMaterials) {
          const { candidateId, resumeId } = await this.candidates.findOrCreateFromResume(tx, identity.workspaceId, material);
          await tx.interviewTask.create({ data: {
            workspaceId: identity.workspaceId, createdBy: identity.actorId, jobId: job.id, candidateId, resumeId,
          } });
        }
        return job.id;
      });
      return this.get(identity.workspaceId, jobId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return this.create(identity, key, raw);
      throw error;
    }
  }

  list(workspaceId: string) {
    return this.db.job.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 200,
      select: { id: true, title: true, department: true, location: true, level: true, recruitingStatus: true, jdVersion: true, createdAt: true } });
  }

  async get(workspaceId: string, id: string) {
    const job = await this.db.job.findFirst({ where: { id, workspaceId }, include: {
      materials: { include: { material: { select: { id: true, name: true, text: true, segments: true, readStatus: true, errorCode: true } } } },
      parseJobs: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, materialId: true, inputVersion: true, status: true, errorCode: true, result: true, attempt: true } },
      tasks: { orderBy: { createdAt: 'desc' }, select: {
        id: true, status: true, matchScore: true, matchRecommendation: true, createdAt: true,
        candidate: { select: { id: true, name: true, email: true } },
      } },
    } });
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND' });
    const { requestKey: _key, requestHash: _hash, ...safe } = job;
    return safe;
  }

  async review(identity: Identity, id: string, raw: unknown) {
    const input = validate(reviewJobSchema, raw);
    const job = await this.get(identity.workspaceId, id);
    const changedJd = job.jdText !== input.jdText;
    await this.db.$transaction(async (tx) => {
      const updated = await tx.job.updateMany({ where: { id, workspaceId: identity.workspaceId, version: input.version }, data: {
        title: input.title, department: input.department, location: input.location, level: input.level,
        recruitingStatus: input.recruitingStatus, jdText: input.jdText, reviewed: true, version: { increment: 1 },
        ...(changedJd ? { jdVersion: { increment: 1 } } : {}),
      } });
      if (!updated.count) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      await tx.revision.create({ data: { jobId: id, actorId: identity.actorId, version: input.version + 1, payload: { ...input, action: 'reviewed' } } });
      if (changedJd) await tx.parseJob.create({ data: { jobId: id, workspaceId: identity.workspaceId, type: 'jd', inputVersion: job.jdVersion + 1,
        input: { sourceId: `jd:${job.jdVersion + 1}`, segments: splitText(input.jdText) } } });
    });
    return this.get(identity.workspaceId, id);
  }

  async extractRequirements(workspaceId: string, id: string) {
    const job = await this.get(workspaceId, id);
    if (!job.jdText) throw new BadRequestException({ code: 'JD_REQUIRED' });
    const existing = job.parseJobs.find((j) => j.type === 'requirements' && j.inputVersion === job.jdVersion && j.status !== 'failed');
    if (existing) return existing;
    return this.db.parseJob.create({ data: { jobId: id, workspaceId, type: 'requirements', inputVersion: job.jdVersion,
      input: { sourceId: `jd:${job.jdVersion}`, segments: splitText(job.jdText) } } });
  }

  async attachMaterial(identity: Identity, id: string, materialId: string) {
    await this.get(identity.workspaceId, id);
    const material = await this.db.material.findFirst({ where: { id: materialId, workspaceId: identity.workspaceId } });
    if (!material) throw new NotFoundException({ code: 'NOT_FOUND' });
    await this.db.jobMaterial.upsert({
      where: { jobId_materialId: { jobId: id, materialId } }, update: {},
      create: { jobId: id, materialId, kind: 'jd' },
    });
    return this.get(identity.workspaceId, id);
  }
}
