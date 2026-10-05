import type { HostContext } from '@migration/bridge';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTaskApi, type TaskApi } from '../api/taskApi';

const HostCtx = createContext<HostContext | null>(null);
const TaskApiCtx = createContext<TaskApi | null>(null);

interface HostProviderProps {
  host: HostContext;
  api?: TaskApi;
  children: ReactNode;
}

export function HostProvider({ host, api, children }: HostProviderProps) {
  const { apiBaseUrl } = host;
  const { token } = host.session;
  const taskApi = useMemo(() => api ?? createTaskApi({ baseUrl: apiBaseUrl, token }), [api, apiBaseUrl, token]);
  return (
    <HostCtx.Provider value={host}>
      <TaskApiCtx.Provider value={taskApi}>{children}</TaskApiCtx.Provider>
    </HostCtx.Provider>
  );
}

export function useHost(): HostContext {
  const host = useContext(HostCtx);
  if (!host) throw new Error('useHost() must be used inside <HostProvider>');
  return host;
}

export function useTaskApi(): TaskApi {
  const api = useContext(TaskApiCtx);
  if (!api) throw new Error('useTaskApi() must be used inside <HostProvider>');
  return api;
}
