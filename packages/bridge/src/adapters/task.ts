import type { LegacyRecordLike } from '../contracts/hostContext';
import { TaskSchema, type Task } from '../contracts/task.generated';

const pad = (n: number) => String(n).padStart(2, '0');

/** Ext dates are local-time Date objects; serialising with toISOString() would shift them across midnight. */
export function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return value instanceof Date ? formatIsoDate(value) : String(value);
}

function normalize(data: Record<string, unknown>) {
  return {
    id: data.id,
    title: data.title,
    status: data.status,
    priority: data.priority,
    assignee: data.assignee ?? null,
    dueDate: toIsoDate(data.dueDate),
    estimateHours: data.estimateHours,
  };
}

/** Strict: throws on contract violations. Use where bad data must be reported (event bridge). */
export function legacyTaskToDTO(data: Record<string, unknown>): Task {
  return TaskSchema.parse(normalize(data));
}

/** Lenient: drops records that fail the contract. Use in render paths (store snapshots). */
export function legacyRecordToTask(record: LegacyRecordLike): Task | null {
  const result = TaskSchema.safeParse(normalize(record.getData()));
  return result.success ? result.data : null;
}

/** Mirrors the `isOverdue` calculate() on Tasks.model.Task. */
export function isTaskOverdue(task: Pick<Task, 'dueDate' | 'status'>, today: Date = new Date()): boolean {
  if (!task.dueDate || task.status === 'done') return false;
  return task.dueDate < formatIsoDate(today);
}
