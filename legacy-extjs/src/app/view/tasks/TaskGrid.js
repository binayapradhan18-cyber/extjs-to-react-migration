import { T } from '../../i18n.js';

const encode = (v) => Ext.String.htmlEncode(v);

Ext.define('Tasks.view.tasks.TaskGrid', {
  extend: 'Ext.grid.Panel',
  alias: 'widget.taskgrid',
  header: false,

  bind: {
    store: '{tasks}',
    selection: '{selectedTask}',
  },

  initComponent() {
    this.emptyText = T('tasks.grid.empty');
    this.columns = [
      { text: T('tasks.col.title'), dataIndex: 'title' },
      {
        text: T('tasks.col.status'),
        dataIndex: 'status',
        width: 100,
        renderer: (value) => `<span class="t-status t-status-${encode(value)}">${encode(T(`tasks.status.${value}`))}</span>`,
      },
      { text: T('tasks.col.priority'), dataIndex: 'priority', width: 75, renderer: (v) => encode(T(`tasks.priority.${v}`)) },
      {
        text: T('tasks.col.assignee'),
        dataIndex: 'assignee',
        width: 120,
        renderer: (v) => (v ? encode(v) : `<span class="t-muted">${encode(T('tasks.unassigned'))}</span>`),
      },
      {
        text: T('tasks.col.dueDate'),
        dataIndex: 'dueDate',
        width: 110,
        renderer: (value, meta, record) => {
          if (record.get('isOverdue')) meta.tdCls = 't-overdue';
          return Ext.util.Format.date(value, 'M j, Y');
        },
      },
      { text: T('tasks.col.estimate'), dataIndex: 'estimateHours', width: 60, align: 'right' },
    ];
    this.callParent();
  },
});
