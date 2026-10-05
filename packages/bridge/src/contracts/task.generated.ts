// Generated from Task.js by codemods/src/extModelToZod.ts. Do not edit by hand.
// Regenerate with: npm run codegen
import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']),
  priority: z.number().int().min(1).max(4),
  assignee: z.string().nullable(),
  dueDate: z.iso.date().nullable(),
  estimateHours: z.number().min(0),
});

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority: number;
  assignee: string | null;
  dueDate: string | null;
  estimateHours: number;
}

export const TaskDefaults = {
  status: 'todo',
  priority: 2,
  estimateHours: 0,
} satisfies Partial<Task>;

/** Derived in Ext (calculate/persist:false), compute in selectors: isOverdue */
export const TaskDerivedFields = ['isOverdue'] as const;
