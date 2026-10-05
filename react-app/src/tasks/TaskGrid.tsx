import { isTaskOverdue, type Task } from '@migration/bridge';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useHost } from '../host/HostProvider';
import { StatusBadge } from './StatusBadge';
import { formatDueDate } from './taskMeta';

const column = createColumnHelper<Task>();
const NUMERIC = new Set(['priority', 'estimateHours']);

interface TaskGridProps {
  tasks: Task[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

export function TaskGrid({ tasks, selectedId, loading, onSelect }: TaskGridProps) {
  const { t } = useHost();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'dueDate', desc: false }]);

  const columns = useMemo(
    () => [
      column.accessor('title', { header: t('tasks.col.title') }),
      column.accessor('status', {
        header: t('tasks.col.status'),
        cell: (c) => <StatusBadge status={c.getValue()} />,
      }),
      column.accessor('priority', {
        header: t('tasks.col.priority'),
        cell: (c) => t(`tasks.priority.${c.getValue()}`),
      }),
      // Nulls map to undefined so sortUndefined keeps them last in both directions, like the legacy store.
      column.accessor((task) => task.assignee ?? undefined, {
        id: 'assignee',
        header: t('tasks.col.assignee'),
        sortUndefined: 'last',
        cell: (c) => c.getValue() ?? <span className="rw-muted">{t('tasks.unassigned')}</span>,
      }),
      column.accessor((task) => task.dueDate ?? undefined, {
        id: 'dueDate',
        header: t('tasks.col.dueDate'),
        sortUndefined: 'last',
        cell: (c) => {
          const overdue = isTaskOverdue(c.row.original);
          return (
            <span className={overdue ? 'rw-overdue' : undefined} title={overdue ? t('tasks.overdue') : undefined}>
              {formatDueDate(c.getValue() ?? null)}
            </span>
          );
        },
      }),
      column.accessor('estimateHours', { header: t('tasks.col.estimate') }),
    ],
    [t],
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (task) => task.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="rw-grid" aria-busy={loading}>
      <table aria-label={t('tasks.title')}>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    className={NUMERIC.has(header.column.id) ? 'rw-num' : undefined}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                  >
                    <button type="button" className="rw-sort" onClick={header.column.getToggleSortingHandler()}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className={sorted ? `rw-sort__icon rw-sort__icon--${sorted}` : 'rw-sort__icon'} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === selectedId;
            return (
              <tr
                key={row.id}
                aria-selected={selected}
                className={selected ? 'rw-row rw-row--selected' : 'rw-row'}
                tabIndex={0}
                onClick={() => onSelect(row.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(row.id);
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={NUMERIC.has(cell.column.id) ? 'rw-num' : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="rw-empty">
                {t('tasks.grid.empty')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
