import { bridge } from '../../bridge.js';

const describe = {
  'task:selected': (e) => (e.taskId ? `selected task ${e.taskId}` : 'cleared selection'),
  'task:saved': (e) => `saved "${e.task.title}"`,
  'widget:error': (e) => `widget error: ${e.message}`,
};

Ext.define('Shell.view.ShellController', {
  extend: 'Ext.app.ViewController',
  alias: 'controller.shell',

  listen: {
    global: {
      tasksaved: 'onTaskSaved',
    },
  },

  init() {
    const store = Ext.getStore('tasks');
    if (!store.getCount() && !store.isLoading()) store.load();
    this.unsubscribe = bridge.bus.onAny((event) => {
      const text = describe[event.type]?.(event);
      if (text) this.getViewModel().set('lastEvent', { side: event.source === 'react' ? 'React' : 'Ext JS', text });
    });
  },

  // Single writer for the shared legacy store, whichever UI performed the save.
  onTaskSaved(task) {
    const record = Ext.getStore('tasks').getById(task.id);
    if (record) {
      record.set(task);
      record.commit();
    }
  },

  destroy() {
    this.unsubscribe?.();
    this.callParent();
  },
});
