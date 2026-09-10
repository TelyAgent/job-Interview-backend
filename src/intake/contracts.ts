import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

export const kindSchema = z.enum(['resume', 'screening', 'assessment', 'other']);
export const createSchema = z.object({
  jd: z.object({ text: z.string().max(150000).optional(), materialId: z.string().uuid().optional(), effectiveSource: z.enum(['text', 'file']) }).strict(),
  materials: z.array(z.object({ materialId: z.string().uuid(), kind: kindSchema }).strict()).max(10).default([]),
}).strict();
export const reviewSchema = z.object({
  version: z.number().int().positive(), title: z.string().trim().min(1).max(200),
  candidateName: z.string().trim().max(200).nullable(),
  candidateEmail: z.union([z.email(), z.literal('')]).nullable(),
  jdText: z.string().trim().min(1).max(150000),
}).strict();
export type Segment = { id: string; text: string; page?: number };
export type ParseInput = { segments: Segment[]; sourceId: string };
const fact = z.object({ value: z.string().max(5000), segmentId: z.string(), quote: z.string().min(1).max(5000) }).strict();
export const extractionSchema = z.object({
  title: fact.nullable(), name: fact.nullable(), email: fact.nullable(),
  facts: z.array(z.object({ category: z.enum(['responsibility', 'requirement', 'experience', 'education', 'skill', 'claim']), ...fact.shape }).strict()).max(100),
  missingFields: z.array(z.string()).max(30), warnings: z.array(z.string()).max(30),
}).strict();

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException({ code: 'INVALID_INPUT', fieldErrors: parsed.error.flatten() });
  return parsed.data;
}
