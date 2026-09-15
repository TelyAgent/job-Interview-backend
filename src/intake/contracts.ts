import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

export const kindSchema = z.enum(['resume', 'screening', 'assessment', 'other']);
export const taskMaterialKindSchema = z.enum(['screening', 'assessment', 'other']);
export const recruitingStatusSchema = z.enum(['open', 'paused', 'closed', 'unknown']);
export const taskStatusSchema = z.enum([
  'draft', 'requirements_ready', 'planning', 'ready_to_schedule', 'interview_in_progress',
  'evidence_requested', 'awaiting_confirmation', 'package_published', 'on_hold', 'not_proceeding',
]);

// Creates a Job and, for each résumé attached, a Candidate + Task in the same call —
// one JD can be matched against several résumés at once.
export const createJobSchema = z.object({
  jd: z.object({ text: z.string().max(150000).optional(), materialId: z.string().uuid().optional(), effectiveSource: z.enum(['text', 'file']) }).strict(),
  resumes: z.array(z.object({ materialId: z.string().uuid() }).strict()).max(10).default([]),
}).strict();

// Links one more résumé to an existing Job (the "link candidate" action).
export const createTaskSchema = z.object({ materialId: z.string().uuid() }).strict();

// Attaches a task-specific material (screening report, assessment result, other) —
// résumés are attached via createTaskSchema instead, since they always create a task.
export const attachTaskMaterialSchema = z.object({ materialId: z.string().uuid(), kind: taskMaterialKindSchema }).strict();

export const reviewJobSchema = z.object({
  version: z.number().int().positive(), title: z.string().trim().min(1).max(200),
  department: z.string().trim().max(200).nullable(),
  location: z.string().trim().max(200).nullable(),
  level: z.string().trim().max(100).nullable(),
  recruitingStatus: recruitingStatusSchema,
  jdText: z.string().trim().min(1).max(150000),
}).strict();

export const reviewTaskSchema = z.object({
  version: z.number().int().positive(), status: taskStatusSchema,
}).strict();

export const roundStatusSchema = z.enum(['Planned', 'completed']);
const roundFieldsShape = {
  name: z.string().trim().min(1).max(200),
  format: z.string().trim().min(1).max(100),
  duration: z.number().int().min(5).max(480),
  competencies: z.string().max(2000),
  questions: z.number().int().min(1).max(20),
  mandatory: z.number().int().min(0).max(20),
  notes: z.string().max(5000),
  interviewerId: z.string().uuid().nullable(),
};
export const createRoundSchema = z.object(roundFieldsShape).partial().strict();
export const updateRoundSchema = z.object({ version: z.number().int().positive(), status: roundStatusSchema, ...roundFieldsShape }).strict();
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
