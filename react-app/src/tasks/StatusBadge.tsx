import { useHost } from '../host/HostProvider';
import type { TaskStatus } from './taskMeta';

export function StatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useHost();
  return <span className={`rw-badge rw-badge--${status}`}>{t(`tasks.status.${status}`)}</span>;
}
