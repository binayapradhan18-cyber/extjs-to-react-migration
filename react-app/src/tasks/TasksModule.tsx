import type { Task } from '@migration/bridge';
import { useBusEvent } from '@migration/bridge/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { upsertTask, useTasksQuery } from '../api/queries';
import { useHost } from '../host/HostProvider';
import { useConfirm } from '../ui/ModalProvider';
import { FilterBar } from './FilterBar';
import { TaskForm } from './TaskForm';
import { TaskGrid } from './TaskGrid';
import { filterTasks, type StatusFilter } from './taskMeta';

const NO_TASKS: Task[] = [];

export function TasksModule() {
  const { t, bus, session } = useHost();
  const client = useQueryClient();
  const confirm = useConfirm();
  const query = useTasksQuery();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);

  useBusEvent(bus, 'tasks:search', (event) => setSearch(event.text));
  useBusEvent(bus, 'task:selected', (event) => {
    if (event.source !== 'react' && event.taskId && !formDirty) setSelectedId(event.taskId);
  });
  useBusEvent(bus, 'task:saved', (event) => {
    if (event.source !== 'react') upsertTask(client, session.projectId, event.task);
  });

  const tasks = query.data ?? NO_TASKS;
  const visible = useMemo(() => filterTasks(tasks, status, search), [tasks, status, search]);
  const selected = useMemo(() => tasks.find((task) => task.id === selectedId) ?? null, [tasks, selectedId]);

  const select = useCallback(
    async (id: string) => {
      if (id === selectedId) return;
      if (formDirty) {
        const discard = await confirm({
          title: t('tasks.confirm.discardTitle'),
          message: t('tasks.confirm.discardMessage'),
        });
        if (!discard) return;
      }
      setSelectedId(id);
      bus.emit({ type: 'task:selected', taskId: id, source: 'react' });
    },
    [selectedId, formDirty, confirm, t, bus],
  );

  const handleSaved = useCallback((task: Task) => bus.emit({ type: 'task:saved', task, source: 'react' }), [bus]);

  return (
    <section className="rw-tasks" aria-labelledby="rw-tasks-heading">
      <header className="rw-panel-header">
        <h2 id="rw-tasks-heading">
          {t('tasks.title')} <span className="rw-count">({visible.length})</span>
        </h2>
      </header>
      <FilterBar
        status={status}
        search={search}
        refreshing={query.isFetching}
        onStatusChange={setStatus}
        onSearchChange={setSearch}
        onRefresh={() => void query.refetch()}
      />
      {query.isError ? (
        <div role="alert" className="rw-error">
          {t('tasks.loadError')}
        </div>
      ) : null}
      <div className="rw-tasks__body">
        <TaskGrid tasks={visible} selectedId={selectedId} loading={query.isPending} onSelect={(id) => void select(id)} />
        <TaskForm task={selected} onSaved={handleSaved} onDirtyChange={setFormDirty} />
      </div>
    </section>
  );
}
