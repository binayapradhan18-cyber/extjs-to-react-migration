import {
  connectLegacyBus,
  createEventBus,
  legacyTaskToDTO,
  registerReactHost,
} from '@migration/bridge';
import { locale, T } from './i18n.js';
import { session } from './session.js';

registerReactHost(Ext);

const bus = createEventBus();

// Legacy global events keep their historical names and positional arguments.
const disconnect = connectLegacyBus(
  bus,
  Ext.GlobalEvents,
  {
    inbound: {
      taskselect: (data) => ({ type: 'task:selected', taskId: data ? String(data.id) : null, source: 'legacy' }),
      tasksaved: (data) => ({ type: 'task:saved', task: legacyTaskToDTO(data), source: 'legacy' }),
      shellsearch: (text) => ({ type: 'tasks:search', text: String(text ?? ''), source: 'legacy' }),
    },
    outbound: {
      'task:saved': (event) => ['tasksaved', event.task],
      'task:selected': (event) => ['taskselect', event.taskId ? { id: event.taskId } : null],
      'nav:navigate': (event) => ['navigate', event.module],
      'widget:error': (event) => ['widgeterror', event],
    },
  },
  {
    onContractViolation: (error, direction, name) => console.warn(`[bridge] ${direction} "${name}" rejected`, error),
  },
);

export const bridge = {
  bus,
  disconnect,
  hostContext: {
    bus,
    session,
    locale,
    t: T,
    apiBaseUrl: import.meta.env.BASE_URL,
    zIndex: { next: () => Ext.WindowManager.next() },
    legacyStores: {
      get tasks() {
        return Ext.getStore('tasks');
      },
    },
  },
};
