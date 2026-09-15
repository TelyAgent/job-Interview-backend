import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

// This module owns Interview Brief question generation end to end. It reads a
// *confirmed* RubricVersion and its CapabilityCard rows from the rubric module (the only
// cross-module dependency — same "read the confirmed output, never the other module's
// internals" boundary the Requirements & Rubric plan set), and otherwise is fully
// self-contained: its own schema, prompt, and validation.

// One capability card, rendered as the "segment" the AI cites back to — same verifiable-
// quote contract every generation type in this codebase uses (see intake/ai.service.ts).
// There is no raw JD text to extract from here; the card itself, already human-confirmed,
// is the source of truth.
export function buildCardSegment(card: {
  id: string; requirement: string; responsibilityType: string; cardPriority: string;
  competencyTags: string; expectedEvidence: string;
}) {
  return {
    id: card.id,
    text: `Requirement: ${card.requirement}\nResponsibility: ${card.responsibilityType}\nPriority: ${card.cardPriority}\nCompetency tags: ${card.competencyTags}\nExpected evidence: ${card.expectedEvidence}`,
  };
}

const questionDraft = z.object({
  segmentId: z.string(), // the capability card this STAR set is for
  quote: z.string().min(1).max(2000),
  situationPrompt: z.string().trim().min(1).max(600),
  taskPrompt: z.string().trim().min(1).max(600),
  actionPrompt: z.string().trim().min(1).max(600),
  resultPrompt: z.string().trim().min(1).max(600),
}).strict();

// One question set per input card, no minimum — a card the model can't turn into a good
// STAR question is better left ungenerated than forced.
export const questionGenerationSchema = z.object({
  questions: z.array(questionDraft).max(12),
  warnings: z.array(z.string()).max(30),
}).strict();

export const QUESTION_GENERATION_SYSTEM_PROMPT =
  'Each segment is one already-confirmed capability verification card for this role — requirement, responsibility type, priority, competency tags, and expected evidence. ' +
  'Draft one STAR (Situation/Task/Action/Result) follow-up question set per card, in the same language as the card text. ' +
  'Each of situationPrompt/taskPrompt/actionPrompt/resultPrompt must be a single, concrete, answerable interview question grounded in that card\'s requirement and expected evidence — never a generic prompt that would fit any role. ' +
  'Quote back the exact segment text as evidence you read it; segmentId must be that card\'s id. ' +
  'No candidate resume or transcript is available at this stage — do not invent or assume any candidate experience, and do not reference a specific project, company, or outcome the card itself does not state. ' +
  'Skip a card entirely rather than inventing a weak question for it. List anything ambiguous in warnings.';

export function collectQuestionRefs(parsed: z.infer<typeof questionGenerationSchema>) {
  return parsed.questions.map((q) => ({ segmentId: q.segmentId, quote: q.quote }));
}

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException({ code: 'INVALID_INPUT', fieldErrors: parsed.error.flatten() });
  return parsed.data;
}
