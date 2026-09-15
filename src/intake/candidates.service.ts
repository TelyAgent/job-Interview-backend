import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class CandidatesService {
  /**
   * Finds the Candidate already linked to this résumé Material, or creates one.
   * A new Candidate gets a placeholder name derived from the file name — the same
   * pattern Job.title uses for a JD-only draft — a human corrects it on review.
   * Reusing by materialId means matching the same résumé against several JDs never
   * re-parses it or creates duplicate candidates.
   */
  async findOrCreateFromResume(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    material: { id: string; name: string; segments: unknown },
  ): Promise<{ candidateId: string; resumeId: string }> {
    const existing = await tx.resume.findUnique({ where: { materialId: material.id } });
    if (existing) return { candidateId: existing.candidateId, resumeId: existing.id };
    const placeholderName = material.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) || 'Unnamed candidate';
    const candidate = await tx.candidate.create({ data: { workspaceId, name: placeholderName } });
    const resume = await tx.resume.create({ data: { workspaceId, candidateId: candidate.id, materialId: material.id } });
    await tx.parseJob.create({ data: {
      workspaceId, resumeId: resume.id, type: 'resume', materialId: material.id, inputVersion: 1,
      input: { sourceId: material.id, segments: material.segments } as Prisma.InputJsonValue,
    } });
    return { candidateId: candidate.id, resumeId: resume.id };
  }
}
