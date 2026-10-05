import type { HostContext, WidgetHandle } from '@migration/bridge';
import { defineReactWidget } from '@migration/bridge/react';
import css from './styles/widget.css?inline';
import { LegacyStoreTaskSummary } from './tasks/TaskSummary';
import { TasksModule } from './tasks/TasksModule';
import { WidgetRoot } from './WidgetRoot';

export type { HostContext, WidgetHandle };

let styleRefs = 0;
let styleEl: HTMLStyleElement | null = null;

// Styles travel inside the bundle and live only while at least one widget is mounted.
function retainStyles(): () => void {
  styleRefs += 1;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.dataset.widgetStyles = 'tasks';
    styleEl.textContent = css;
    document.head.append(styleEl);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    styleRefs -= 1;
    if (styleRefs === 0) {
      styleEl?.remove();
      styleEl = null;
    }
  };
}

function withStyles(mount: (el: HTMLElement, host: HostContext) => WidgetHandle<HostContext>) {
  return (el: HTMLElement, host: HostContext): WidgetHandle<HostContext> => {
    const release = retainStyles();
    const handle = mount(el, host);
    return {
      update: (next) => handle.update(next),
      resize: (size) => handle.resize?.(size),
      unmount: () => {
        handle.unmount();
        release();
      },
    };
  };
}

function TasksWidget(host: HostContext) {
  return (
    <WidgetRoot host={host} widget="tasks">
      <TasksModule />
    </WidgetRoot>
  );
}

function TaskSummaryWidget(host: HostContext) {
  return (
    <WidgetRoot host={host} widget="task-summary">
      <LegacyStoreTaskSummary store={host.legacyStores?.tasks} />
    </WidgetRoot>
  );
}

/** Entry point for the Ext shell: `mountTasksWidget(el, hostContext) => { update, unmount }`. */
export const mountTasksWidget = withStyles(defineReactWidget(TasksWidget));

/** Dashboard cards rendered from the shell's legacy Ext store via useExtStore. */
export const mountTaskSummaryWidget = withStyles(defineReactWidget(TaskSummaryWidget));
