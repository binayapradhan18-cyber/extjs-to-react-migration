Ext.define('Tasks.model.Task', {
  extend: 'Ext.data.Model',
  idProperty: 'id',

  fields: [
    { name: 'id', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'status', type: 'string', defaultValue: 'todo' },
    { name: 'priority', type: 'int', defaultValue: 2 },
    { name: 'assignee', type: 'string', allowNull: true },
    { name: 'dueDate', type: 'date', dateFormat: 'Y-m-d', allowNull: true },
    { name: 'estimateHours', type: 'float', defaultValue: 0 },
    {
      name: 'isOverdue',
      type: 'boolean',
      persist: false,
      calculate: function (data) {
        return Boolean(data.dueDate) && data.status !== 'done' && data.dueDate < Ext.Date.today();
      },
    },
  ],

  validators: {
    title: [{ type: 'presence' }, { type: 'length', max: 120 }],
    status: { type: 'inclusion', list: ['todo', 'in_progress', 'blocked', 'done'] },
    priority: { type: 'range', min: 1, max: 4 },
    estimateHours: { type: 'range', min: 0 },
  },
});
