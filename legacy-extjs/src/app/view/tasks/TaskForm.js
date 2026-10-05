import { T } from '../../i18n.js';

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

Ext.define('Tasks.view.tasks.TaskForm', {
  extend: 'Ext.form.Panel',
  alias: 'widget.taskform',
  bodyPadding: 12,

  bind: {
    title: '{detailTitle}',
    disabled: '{!hasSelection}',
  },

  initComponent() {
    this.items = [
      { xtype: 'textfield', name: 'title', fieldLabel: T('tasks.col.title'), allowBlank: false, blankText: T('validation.required') },
      {
        xtype: 'combobox',
        name: 'status',
        fieldLabel: T('tasks.col.status'),
        store: STATUSES.map((s) => [s, T(`tasks.status.${s}`)]),
      },
      {
        xtype: 'combobox',
        name: 'priority',
        fieldLabel: T('tasks.col.priority'),
        store: [1, 2, 3, 4].map((p) => [p, T(`tasks.priority.${p}`)]),
      },
      { xtype: 'textfield', name: 'assignee', fieldLabel: T('tasks.col.assignee') },
      { xtype: 'datefield', name: 'dueDate', fieldLabel: T('tasks.col.dueDate') },
      { xtype: 'numberfield', name: 'estimateHours', fieldLabel: T('tasks.col.estimate'), minValue: 0, step: 0.5 },
    ];
    this.bbar = [
      '->',
      { text: T('tasks.form.reset'), ui: 'secondary', handler: 'onReset' },
      { text: T('tasks.form.save'), handler: 'onSave' },
    ];
    this.callParent();
  },
});
