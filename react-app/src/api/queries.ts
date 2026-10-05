import type { Task } from '@migration/bridge';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useHost, useTaskApi } from '../host/HostProvider';

export const taskKeys = {
  list: (projectId: string) => ['tasks', projectId] as const,
};

export function upsertTask(client: QueryClient, projectId: string, task: Task): void {
  client.setQueryData<Task[]>(taskKeys.list(projectId), (previous) =>
    previous?.map((existing) => (existing.id === task.id ? task : existing)),
  );
}

export function useTasksQuery() {
  const { session } = useHost();
  const api = useTaskApi();
  return useQuery({
    queryKey: taskKeys.list(session.projectId),
    queryFn: () => api.list(session.projectId),
  });
}

export function useSaveTask() {
  const { session } = useHost();
  const api = useTaskApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => api.save(task),
    onSuccess: (saved) => upsertTask(client, session.projectId, saved),
  });
}
