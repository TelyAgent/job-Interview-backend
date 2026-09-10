import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../persistence/prisma.service';
import { createSchema, reviewSchema, kindSchema, validate, type ParseInput } from './contracts';
import { z } from 'zod';
import { splitText } from './materials.service';
import type { Identity } from './workspace.guard';

@Injectable()
export class ProjectsService {
  constructor(private readonly db: PrismaService) {}
  async create(identity: Identity, key: string | undefined, raw: unknown): Promise<Awaited<ReturnType<ProjectsService['get']>>> {
    if (!key || key.length > 100) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const input = validate(createSchema, raw);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = await this.db.project.findUnique({ where: { workspaceId_createdBy_requestKey: { workspaceId: identity.workspaceId, createdBy: identity.actorId, requestKey: key } } });
    if (existing) {
      if (existing.requestHash !== hash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
      return this.get(identity.workspaceId, existing.id);
    }
    const ids = [...input.materials.map((m) => m.materialId), ...(input.jd.materialId ? [input.jd.materialId] : [])];
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: 'DUPLICATE_MATERIAL' });
    const materials = await this.db.material.findMany({ where: { id: { in: ids }, workspaceId: identity.workspaceId } });
    if (materials.length !== ids.length) throw new NotFoundException({ code: 'NOT_FOUND' });
    const jdMaterial = materials.find((m) => m.id === input.jd.materialId);
    const jdText = input.jd.effectiveSource === 'text' ? input.jd.text?.trim() || '' : jdMaterial?.text || '';
    if (!jdText && !jdMaterial) throw new BadRequestException({ code: 'JD_REQUIRED' });
    const jdInput: ParseInput = { sourceId: input.jd.effectiveSource === 'file' ? jdMaterial!.id : 'jd:1', segments: input.jd.effectiveSource === 'file' ? jdMaterial!.segments as unknown as ParseInput['segments'] : splitText(jdText) };
    try {
      const project = await this.db.$transaction(async (tx) => {
        return tx.project.create({ data: {
          workspaceId: identity.workspaceId, createdBy: identity.actorId, requestKey: key, requestHash: hash,
          title: jdText.split('\n')[0]?.slice(0, 200) || 'Untitled role', jdText,
          materials: { create: [
            ...input.materials.map((m) => ({ materialId: m.materialId, kind: m.kind })),
            ...(jdMaterial ? [{ materialId: jdMaterial.id, kind: 'jd' }] : []),
          ] },
          jobs: { create: [
            ...(jdText ? [{ workspaceId: identity.workspaceId, type: 'jd', inputVersion: 1, input: jdInput as unknown as Prisma.InputJsonValue }] : []),
            ...input.materials.filter((m) => m.kind === 'resume' && materials.find((f) => f.id === m.materialId)?.readStatus === 'available').map((m) => ({
              workspaceId: identity.workspaceId, type: 'resume', materialId: m.materialId, inputVersion: 1,
              input: { sourceId: m.materialId, segments: materials.find((f) => f.id === m.materialId)!.segments } as Prisma.InputJsonValue,
            })),
          ] },
          revisions: { create: { actorId: identity.actorId, version: 1, payload: { action: 'created', jdText } } },
        } });
      });
      return this.get(identity.workspaceId, project.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return this.create(identity, key, raw);
      throw error;
    }
  }
  list(workspaceId: string) {
    return this.db.project.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 200,
      select: { id: true, title: true, candidateName: true, reviewed: true, createdAt: true, version: true } });
  }
  async get(workspaceId: string, id: string) {
    const project = await this.db.project.findFirst({ where: { id, workspaceId }, include: {
      materials: { include: { material: { select: { id: true, name: true, text: true, segments: true, readStatus: true, errorCode: true } } } },
      jobs: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, materialId: true, inputVersion: true, status: true, errorCode: true, result: true, attempt: true } },
    } });
    if (!project) throw new NotFoundException({ code: 'NOT_FOUND' });
    const { requestKey: _key, requestHash: _hash, ...safe } = project;
    return safe;
  }
  async review(identity: Identity, id: string, raw: unknown) {
    const input = validate(reviewSchema, raw);
    const project = await this.get(identity.workspaceId, id);
    const changedJd = project.jdText !== input.jdText;
    await this.db.$transaction(async (tx) => {
      const updated = await tx.project.updateMany({ where: { id, workspaceId: identity.workspaceId, version: input.version }, data: {
        title: input.title, candidateName: input.candidateName || null, candidateEmail: input.candidateEmail || null,
        jdText: input.jdText, reviewed: true, version: { increment: 1 }, ...(changedJd ? { jdVersion: { increment: 1 } } : {}),
      } });
      if (!updated.count) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      await tx.revision.create({ data: { projectId: id, actorId: identity.actorId, version: input.version + 1, payload: { ...input, action: 'reviewed' } } });
      if (changedJd) await tx.parseJob.create({ data: { projectId: id, workspaceId: identity.workspaceId, type: 'jd', inputVersion: project.jdVersion + 1,
        input: { sourceId: `jd:${project.jdVersion + 1}`, segments: splitText(input.jdText) } } });
    });
    return this.get(identity.workspaceId, id);
  }
  async extractRequirements(workspaceId: string, id: string) {
    const project = await this.get(workspaceId, id);
    if (!project.jdText) throw new BadRequestException({ code: 'JD_REQUIRED' });
    const existing = project.jobs.find((j) => j.type === 'requirements' && j.inputVersion === project.jdVersion && j.status !== 'failed');
    if (existing) return existing;
    return this.db.parseJob.create({ data: { projectId: id, workspaceId, type: 'requirements', inputVersion: project.jdVersion,
      input: { sourceId: `jd:${project.jdVersion}`, segments: splitText(project.jdText) } } });
  }
  async attach(identity: Identity, id: string, raw: unknown) {
    const input = validate(z.object({ materialId: z.string().uuid(), kind: kindSchema }).strict(), raw);
    await this.get(identity.workspaceId, id);
    const material = await this.db.material.findFirst({ where: { id: input.materialId, workspaceId: identity.workspaceId } });
    if (!material) throw new NotFoundException({ code: 'NOT_FOUND' });
    await this.db.$transaction(async (tx) => {
      const found = await tx.projectMaterial.findUnique({ where: { projectId_materialId: { projectId: id, materialId: material.id } } });
      if (found) return;
      await tx.projectMaterial.create({ data: { projectId: id, materialId: material.id, kind: input.kind } });
      if (input.kind === 'resume' && material.readStatus === 'available') await tx.parseJob.create({ data: {
        projectId: id, workspaceId: identity.workspaceId, type: 'resume', materialId: material.id, inputVersion: 1,
        input: { sourceId: material.id, segments: material.segments } as Prisma.InputJsonValue,
      } });
    });
    return this.get(identity.workspaceId, id);
  }
}
