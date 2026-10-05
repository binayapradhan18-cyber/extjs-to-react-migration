import { T } from '../../i18n.js';

Ext.define('Tasks.view.tasks.TasksMain', {
  extend: 'Ext.panel.Panel',
  alias: 'widget.tasks-main',
  controller: 'tasks',
  viewModel: 'tasks',
  layout: 'hbox',
  cls: 'tasks-main',

  initComponent() {
    this.bind = { title: `${T('tasks.title')} ({tasks.count})` };
    this.tbar = [
      {
        xtype: 'combobox',
        fieldLabel: T('tasks.filter.status'),
        store: ['all', 'todo', 'in_progress', 'blocked', 'done'].map((s) => [s, T(`tasks.status.${s}`)]),
        bind: { value: '{statusFilter}' },
        listeners: { change: 'onFilterChange' },
      },
      {
        xtype: 'textfield',
        emptyText: T('tasks.filter.search'),
        bind: { value: '{searchText}' },
        listeners: { change: 'onFilterChange' },
      },
      '->',
      { text: T('tasks.refresh'), ui: 'secondary', handler: 'onRefresh' },
    ];
    this.items = [
      { xtype: 'taskgrid', reference: 'taskGrid', flex: 3 },
      { xtype: 'taskform', reference: 'taskForm', flex: 2 },
    ];
    this.callParent();
  },
});
