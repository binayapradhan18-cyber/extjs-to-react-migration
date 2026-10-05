import type { Task } from '@migration/bridge';

export type TaskStatus = Task['status'];
export type StatusFilter = TaskStatus | 'all';

export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
export const PRIORITIES = [1, 2, 3, 4] as const;

/** Same semantics as the legacy store filters: exact status, case-insensitive title substring. */
export function filterTasks(tasks: readonly Task[], status: StatusFilter, search: string): Task[] {
  const needle = search.trim().toLowerCase();
  return tasks.filter(
    (task) => (status === 'all' || task.status === status) && (!needle || task.title.toLowerCase().includes(needle)),
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Matches Ext.util.Format.date(value, 'M j, Y') so parity screenshots line up. */
export function formatDueDate(isoDate: string | null): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${MONTHS[(month ?? 1) - 1]} ${day}, ${year}`;
}
