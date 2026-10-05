import type { HostContext, Task } from '@migration/bridge';
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { TaskApi } from '../src/api/taskApi';
import { createStandaloneHost } from '../src/host/standaloneHost';
import { WidgetRoot } from '../src/WidgetRoot';

export const fixtures: [Task, Task, Task] = [
  { id: 'T-1', title: 'Pour footing concrete', status: 'in_progress', priority: 4, assignee: 'Marco', dueDate: '2026-10-02', estimateHours: 16 },
  { id: 'T-2', title: 'Order structural steel', status: 'todo', priority: 3, assignee: null, dueDate: '2026-10-09', estimateHours: 4 },
  { id: 'T-3', title: 'Rebar inspection', status: 'blocked', priority: 4, assignee: 'Ana', dueDate: null, estimateHours: 2 },
];

export function createMockApi(tasks: Task[] = fixtures) {
  return {
    list: vi.fn<TaskApi['list']>(async () => tasks.map((t) => ({ ...t }))),
    save: vi.fn<TaskApi['save']>(async (task) => task),
  };
}

export function renderInWidget(ui: ReactNode, options: { host?: HostContext; api?: TaskApi } = {}) {
  const host = options.host ?? createStandaloneHost();
  const api = options.api ?? createMockApi();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <WidgetRoot host={host} widget="test" api={api} queryClient={queryClient}>
      {ui}
    </WidgetRoot>,
  );
  return { ...result, host, api, queryClient };
}
