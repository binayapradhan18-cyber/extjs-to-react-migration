import type { HostContext } from '@migration/bridge';
import { QueryTaskSummary } from './tasks/TaskSummary';
import { TasksModule } from './tasks/TasksModule';
import { WidgetRoot } from './WidgetRoot';

export function App({ host }: { host: HostContext }) {
  return (
    <WidgetRoot host={host} widget="standalone">
      <div className="rw-app">
        <header className="rw-app__header">
          <strong>{host.t('shell.brand')}</strong>
          <span className="rw-app__tag">React standalone</span>
          <span className="rw-spacer" />
          <span>{host.session.displayName}</span>
        </header>
        <main className="rw-app__main">
          <QueryTaskSummary />
          <TasksModule />
        </main>
      </div>
    </WidgetRoot>
  );
}
