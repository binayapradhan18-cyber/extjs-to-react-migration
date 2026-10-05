import { isTaskOverdue, legacyRecordToTask, type HostContext, type Task } from '@migration/bridge';
import { useExtStore } from '@migration/bridge/react';
import { useMemo } from 'react';
import { useTasksQuery } from '../api/queries';
import { useHost } from '../host/HostProvider';
import { TASK_STATUSES } from './taskMeta';

/** Presentational: the same cards whether the data comes from TanStack Query or a legacy Ext store. */
export function TaskSummary({ tasks }: { tasks: readonly Task[] }) {
  const { t } = useHost();
  const cards = useMemo(() => {
    const hours = tasks.reduce((sum, task) => sum + task.estimateHours, 0);
    return [
      { key: 'total', label: t('dashboard.total'), value: String(tasks.length) },
      ...TASK_STATUSES.map((status) => ({
        key: status,
        label: t(`tasks.status.${status}`),
        value: String(tasks.filter((task) => task.status === status).length),
      })),
      { key: 'overdue', label: t('dashboard.overdue'), value: String(tasks.filter((task) => isTaskOverdue(task)).length) },
      { key: 'hours', label: t('dashboard.estimate'), value: hours.toFixed(1) },
    ];
  }, [tasks, t]);

  return (
    <section className="rw-summary" aria-label={t('dashboard.title')}>
      {cards.map((card) => (
        <div key={card.key} className="rw-card" data-card={card.key}>
          <div className="rw-card__value">{card.value}</div>
          <div className="rw-card__label">{card.label}</div>
        </div>
      ))}
    </section>
  );
}

type LegacyTaskStore = NonNullable<NonNullable<HostContext['legacyStores']>['tasks']>;

/** Transition-period container: reads the shell's Ext store directly until the dashboard owns its data. */
export function LegacyStoreTaskSummary({ store }: { store: LegacyTaskStore | undefined }) {
  const mapped = useExtStore(store, legacyRecordToTask);
  const tasks = useMemo(() => mapped.filter((task): task is Task => task !== null), [mapped]);
  return <TaskSummary tasks={tasks} />;
}

export function QueryTaskSummary() {
  const { data } = useTasksQuery();
  return <TaskSummary tasks={data ?? []} />;
}
