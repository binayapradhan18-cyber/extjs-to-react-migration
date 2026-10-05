Ext.define('Tasks.store.Tasks', {
  extend: 'Ext.data.Store',
  alias: 'store.tasks',
  storeId: 'tasks',
  model: 'Tasks.model.Task',
  proxy: {
    type: 'ajax',
    url: 'api/tasks.json',
    reader: { type: 'json', rootProperty: 'data' },
  },
  sorters: [{ property: 'dueDate', direction: 'ASC' }],
});
