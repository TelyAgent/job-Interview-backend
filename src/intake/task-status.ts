import { PrismaService } from '../persistence/prisma.service';

// Mirrors taskStatusSchema's order in contracts.ts, minus the two exception states
// (on_hold / not_proceeding) which sit outside the pipeline and are never auto-set.
const STATUS_ORDER = [
  'draft', 'requirements_ready', 'planning', 'ready_to_schedule', 'interview_in_progress',
  'evidence_requested', 'awaiting_confirmation', 'package_published',
] as const;
type PipelineStatus = (typeof STATUS_ORDER)[number];

/**
 * Nudges a task's status forward to `target` when an objective, system-observable
 * milestone happens (the rubric got confirmed, a round got scheduled) — never backward,
 * and never over a status outside the normal pipeline order (on_hold, not_proceeding, or
 * anything already past `target`). A human can still set any status explicitly via
 * PATCH /tasks/:id/intake; this only fills the gap where nothing was.
 */
export async function advanceTaskStatus(db: PrismaService, workspaceId: string, taskId: string, target: PipelineStatus) {
  const targetIndex = STATUS_ORDER.indexOf(target);
  const advanceable = STATUS_ORDER.slice(0, targetIndex);
  await db.interviewTask.updateMany({
    where: { id: taskId, workspaceId, status: { in: advanceable } },
    data: { status: target, version: { increment: 1 } },
  });
}

export async function advanceTasksStatusForJob(db: PrismaService, workspaceId: string, jobId: string, target: PipelineStatus) {
  const tasks = await db.interviewTask.findMany({ where: { jobId, workspaceId }, select: { id: true } });
  await Promise.all(tasks.map((t) => advanceTaskStatus(db, workspaceId, t.id, target)));
}
