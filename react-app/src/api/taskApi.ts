import { TaskSchema, type Task } from '@migration/bridge';
import { z } from 'zod';

const TaskListResponseSchema = z.object({
  data: z.array(TaskSchema),
  total: z.number().int(),
});

export interface TaskApi {
  list(projectId: string): Promise<Task[]>;
  save(task: Task): Promise<Task>;
}

export interface TaskApiOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  latencyMs?: number;
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// The demo backend is a static JSON file; writes are kept in memory for the page lifetime.
const savedTasks = new Map<string, Task>();

export function createTaskApi({ baseUrl, token, fetchImpl, latencyMs = 150 }: TaskApiOptions): TaskApi {
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const doFetch = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  return {
    async list() {
      const response = await doFetch(`${root}api/tasks.json`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new HttpError(response.status, `Task list failed (${response.status})`);
      // Validate at the boundary: a backend contract change fails here, not deep in a component.
      const body = TaskListResponseSchema.parse(await response.json());
      return body.data.map((task) => savedTasks.get(task.id) ?? task);
    },
    async save(task) {
      const valid = TaskSchema.parse(task);
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
      savedTasks.set(valid.id, valid);
      return valid;
    },
  };
}
