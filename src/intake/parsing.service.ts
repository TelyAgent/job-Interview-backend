import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../persistence/prisma.service';
import { AiService, ParseFailure } from './ai.service';
import type { ParseInput } from './contracts';

@Injectable()
export class ParsingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ParsingService.name);
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  constructor(private readonly db: PrismaService, private readonly ai: AiService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.pending) this.pending = this.tick().catch(() => this.logger.error('Parsing worker failed; pending tasks remain persisted')).finally(() => { this.pending = undefined; });
    }, 1000);
    this.timer.unref();
  }
  async onModuleDestroy() { clearInterval(this.timer); await this.pending; }
  async tick() {
    const now = new Date();
    const eligibility: Prisma.ParseJobWhereInput = { OR: [
      { status: 'queued', nextRunAt: { lte: now } }, { status: 'parsing', leaseUntil: { lt: now } },
    ] };
    const job = await this.db.parseJob.findFirst({ where: eligibility, orderBy: { createdAt: 'asc' } });
    if (!job) return;
    const token = randomUUID();
    // Compare-and-set plus a fencing token prevents concurrent workers applying the same result.
    const claim = await this.db.parseJob.updateMany({ where: { id: job.id, ...eligibility }, data: {
      status: 'parsing', leaseToken: token, leaseUntil: new Date(Date.now() + 90000), attempt: { increment: 1 },
    } });
    if (!claim.count) return;
    try {
      const output = await this.ai.extract(job.type, job.input as unknown as ParseInput);
      await this.db.parseJob.updateMany({ where: { id: job.id, leaseToken: token }, data: {
        status: 'needs_review', result: output.result, model: output.model, usage: output.usage,
        errorCode: null, leaseToken: null, leaseUntil: null,
      } });
    } catch (error) {
      const failure = error instanceof ParseFailure ? error : new ParseFailure('AI_REQUEST_FAILED', true);
      const retry = failure.retryable && job.attempt < 2;
      await this.db.parseJob.updateMany({ where: { id: job.id, leaseToken: token }, data: {
        status: retry ? 'queued' : 'failed', errorCode: failure.code, leaseToken: null, leaseUntil: null,
        nextRunAt: new Date(Date.now() + 5000 * 2 ** job.attempt),
      } });
    }
  }
  async get(workspaceId: string, id: string) {
    const job = await this.db.parseJob.findFirst({ where: { id, workspaceId }, select: {
      id: true, projectId: true, type: true, status: true, errorCode: true, result: true, inputVersion: true, attempt: true,
    } });
    if (!job) throw new NotFoundException({ code: 'NOT_FOUND' });
    return job;
  }
  async retry(workspaceId: string, id: string) {
    const job = await this.get(workspaceId, id);
    const project = await this.db.project.findUniqueOrThrow({ where: { id: job.projectId } });
    if (job.type !== 'resume' && job.inputVersion !== project.jdVersion) throw new ConflictException({ code: 'VERSION_CONFLICT' });
    const changed = await this.db.parseJob.updateMany({ where: { id, workspaceId, status: 'failed' }, data: { status: 'queued', attempt: 0, errorCode: null, nextRunAt: new Date() } });
    if (!changed.count) throw new ConflictException({ code: 'TASK_NOT_FAILED' });
    return this.get(workspaceId, id);
  }
}
