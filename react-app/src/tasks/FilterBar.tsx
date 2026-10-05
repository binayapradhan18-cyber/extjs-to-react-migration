import { useId } from 'react';
import { useHost } from '../host/HostProvider';
import { TASK_STATUSES, type StatusFilter } from './taskMeta';

interface FilterBarProps {
  status: StatusFilter;
  search: string;
  refreshing: boolean;
  onStatusChange: (status: StatusFilter) => void;
  onSearchChange: (text: string) => void;
  onRefresh: () => void;
}

const STATUS_OPTIONS: readonly StatusFilter[] = ['all', ...TASK_STATUSES];

export function FilterBar({ status, search, refreshing, onStatusChange, onSearchChange, onRefresh }: FilterBarProps) {
  const { t } = useHost();
  const statusId = useId();
  return (
    <div className="rw-toolbar" role="toolbar" aria-label={t('tasks.title')}>
      <label htmlFor={statusId}>{t('tasks.filter.status')}</label>
      <select id={statusId} value={status} onChange={(e) => onStatusChange(e.target.value as StatusFilter)}>
        {STATUS_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {t(`tasks.status.${value}`)}
          </option>
        ))}
      </select>
      <input
        type="search"
        value={search}
        placeholder={t('tasks.filter.search')}
        aria-label={t('tasks.filter.search')}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <span className="rw-spacer" />
      <button type="button" className="rw-btn rw-btn--secondary" onClick={onRefresh} disabled={refreshing}>
        {t('tasks.refresh')}
      </button>
    </div>
  );
}
