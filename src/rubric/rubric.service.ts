import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { splitText } from '../intake/materials.service';
import type { ParseInput } from '../intake/contracts';
import type { Identity } from '../intake/workspace.guard';
import { updateRubricSchema, confirmRubricSchema, validate, type cardGenerationSchema } from './contracts';
import type { z } from 'zod';

const RUBRIC_SELECT = {
  id: true, jobId: true, versionNumber: true, status: true, version: true,
  confirmedBy: true, confirmedAt: true, createdAt: true,
  cards: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true, requirement: true, responsibilityType: true, cardPriority: true,
      competencyTags: true, expectedEvidence: true, levelAnchors: true, weight: true, sourceRefs: true,
    },
  },
} satisfies Prisma.RubricVersionSelect;

type CardDraft = z.infer<typeof cardGenerationSchema>['cards'][number];

@Injectable()
export class RubricService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Entry point for the whole capability — usable for any Job regardless of how the
   * task reached this workspace: today the manual "create interview project" flow,
   * and later a hand-off notification from an upstream Resume Screening subsystem.
   * Idempotent per JD version, same pattern as JobsService.review()'s JD-change parse job.
   */
  async generate(workspaceId: string, jobId: string) {
    const job = await this.getJobWithParseJobs(workspaceId, jobId);
    if (!job.jdText) throw new BadRequestException({ code: 'JD_REQUIRED' });
    const existing = job.parseJobs.find((j) => j.type === 'capability_cards' && j.inputVersion === job.jdVersion && j.status !== 'failed');
    if (existing) return existing;
    const input: ParseInput = { sourceId: `jd:${job.jdVersion}`, segments: splitText(job.jdText) };
    return this.db.parseJob.create({ data: {
      jobId, workspaceId, type: 'capability_cards', inputVersion: job.jdVersion,
      input: input as unknown as Prisma.InputJsonValue,
    } });
  }

  /**
   * Returns the current generation status plus the latest materialized rubric version
   * (draft or confirmed), materializing a just-finished AI draft into persisted,
   * editable `CapabilityCard` rows the first time it is read.
   */
  async getRubric(workspaceId: string, jobId: string) {
    const job = await this.getJobWithParseJobs(workspaceId, jobId);
    await this.materializeIfReady(workspaceId, jobId, job);
    const rubric = await this.db.rubricVersion.findFirst({ where: { workspaceId, jobId }, orderBy: { versionNumber: 'desc' }, select: RUBRIC_SELECT });
    const generationJob = job.parseJobs.find((j) => j.type === 'capability_cards' && j.inputVersion === job.jdVersion) ?? null;
    return {
      jobId, jdVersion: job.jdVersion,
      generation: generationJob ? { id: generationJob.id, status: generationJob.status, errorCode: generationJob.errorCode } : null,
      rubric,
    };
  }

  async update(identity: Identity, jobId: string, raw: unknown) {
    const input = validate(updateRubricSchema, raw);
    const draft = await this.requireDraft(identity.workspaceId, jobId);
    return this.db.$transaction(async (tx) => {
      const locked = await tx.rubricVersion.updateMany({ where: { id: draft.id, version: input.version }, data: { version: { increment: 1 } } });
      if (!locked.count) throw new ConflictException({ code: 'VERSION_CONFLICT' });
      const keepIds = input.cards.filter((c) => c.id).map((c) => c.id!);
      await tx.capabilityCard.deleteMany({ where: { rubricVersionId: draft.id, id: { notIn: keepIds.length ? keepIds : ['__none__'] } } });
      for (const c of input.cards) {
        const data = {
          requirement: c.requirement, responsibilityType: c.responsibilityType, cardPriority: c.cardPriority,
          competencyTags: c.competencyTags.join(','), expectedEvidence: c.expectedEvidence,
          levelAnchors: c.levelAnchors as unknown as Prisma.InputJsonValue, weight: c.weight,
        };
        if (c.id) await tx.capabilityCard.update({ where: { id: c.id }, data });
        else await tx.capabilityCard.create({ data: { ...data, workspaceId: identity.workspaceId, rubricVersionId: draft.id, sourceRefs: [] } });
      }
      return tx.rubricVersion.findUniqueOrThrow({ where: { id: draft.id }, select: RUBRIC_SELECT });
    });
  }

  async confirm(identity: Identity, jobId: string, raw: unknown) {
    const input = validate(confirmRubricSchema, raw);
    const draft = await this.requireDraft(identity.workspaceId, jobId);
    const updated = await this.db.rubricVersion.updateMany({
      where: { id: draft.id, version: input.version, status: 'draft' },
      data: { status: 'confirmed', confirmedBy: identity.actorId, confirmedAt: new Date(), version: { increment: 1 } },
    });
    if (!updated.count) throw new ConflictException({ code: 'VERSION_CONFLICT' });
    return this.db.rubricVersion.findUniqueOrThrow({ where: { id: draft.id }, select: RUBRIC_SELECT });
  }

  /** Clones the latest confirmed version into a new editable draft (the "Create new version" action). */
  async newVersion(identity: Identity, jobId: string) {
    const latest = await this.db.rubricVersion.findFirst({
      where: { workspaceId: identity.workspaceId, jobId }, orderBy: { versionNumber: 'desc' }, select: RUBRIC_SELECT,
    });
    if (!latest || latest.status !== 'confirmed') throw new ConflictException({ code: 'RUBRIC_NOT_CONFIRMED' });
    return this.db.rubricVersion.create({
      data: {
        workspaceId: identity.workspaceId, jobId, versionNumber: latest.versionNumber + 1, status: 'draft',
        cards: { create: latest.cards.map((c) => ({
          workspaceId: identity.workspaceId, requirement: c.requirement, responsibilityType: c.responsibilityType,
          cardPriority: c.cardPriority, competencyTags: c.competencyTags, expectedEvidence: c.expectedEvidence,
          levelAnchors: c.levelAnchors as unknown as Prisma.InputJsonValue, weight: c.weight,
          sourceRefs: c.sourceRefs as unknown as Prisma.InputJsonValue,
        })) },
      },
      select: RUBRIC_SELECT,
    });
  }

  private async requireDraft(workspaceId: string, jobId: string) {
    const latest = await this.db.rubricVersion.findFirst({ where: { workspaceId, jobId }, orderBy: { versionNumber: 'desc' }, select: RUBRIC_SELECT });
    if (!latest) throw new NotFoundException({ code: 'NOT_FOUND' });
    if (latest.status !== 'draft') throw new ConflictException({ code: 'RUBRIC_NOT_DRAFT' });
    return latest;
  }

  // Turns a completed `capability_cards` ParseJob into a persisted RubricVersion the
  // first time anyone reads it. Keyed by `sourceParseJobId` so a concurrent read never
  // double-materializes the same AI draft, and a JD edit that produces a new draft
  // naturally becomes its own new version rather than overwriting an in-progress one.
  private async materializeIfReady(workspaceId: string, jobId: string, job: { jdVersion: number; parseJobs: { id: string; type: string; inputVersion: number; status: string; result: unknown }[] }) {
    const ready = job.parseJobs.find((j) => j.type === 'capability_cards' && j.inputVersion === job.jdVersion && j.status === 'needs_review');
    if (!ready) return;
    const already = await this.db.rubricVersion.findFirst({ where: { sourceParseJobId: ready.id } });
    if (already) return;
    const result = ready.result as unknown as z.infer<typeof cardGenerationSchema>;
    await this.db.$transaction(async (tx) => {
      const race = await tx.rubricVersion.findFirst({ where: { sourceParseJobId: ready.id } });
      if (race) return;
      const last = await tx.rubricVersion.findFirst({ where: { jobId }, orderBy: { versionNumber: 'desc' } });
      await tx.rubricVersion.create({ data: {
        workspaceId, jobId, versionNumber: (last?.versionNumber ?? 0) + 1, status: 'draft', sourceParseJobId: ready.id,
        cards: { create: result.cards.map((c: CardDraft) => ({
          workspaceId, requirement: c.requirement, responsibilityType: c.responsibilityType, cardPriority: c.cardPriority,
          competencyTags: c.competencyTags.join(','), expectedEvidence: c.expectedEvidence,
          levelAnchors: c.levelAnchors as unknown as Prisma.InputJsonValue, weight: c.weight,
          sourceRefs: [{ segmentId: c.segmentId, quote: c.quote }] as unknown as Prisma.InputJsonValue,
        })) },
      } });
    });
  }

  private async getJobWithParseJobs(workspaceId: string, jobId: string) {
    const job = await this.db.job.findFirst({
      where: { id: jobId, workspaceId },
      select: {
        id: true, jdText: true, jdVersion: true,
        parseJobs: { where: { type: 'capability_cards' }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, inputVersion: true, status: true, errorCode: true, result: true } },
      },
    });
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND' });
    return job;
  }
}
