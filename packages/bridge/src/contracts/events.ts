import type { Task } from './task.generated';

export type UiSource = 'legacy' | 'react';

/** Every message that crosses the Ext <-> React boundary. Add variants here first; both sides get compile errors. */
export type BridgeEvent =
  | { type: 'task:selected'; taskId: string | null; source: UiSource }
  | { type: 'task:saved'; task: Task; source: UiSource }
  | { type: 'tasks:search'; text: string; source: UiSource }
  | { type: 'nav:navigate'; module: string; source: UiSource }
  | { type: 'widget:error'; widget: string; message: string; source: UiSource };

export type BridgeEventType = BridgeEvent['type'];
