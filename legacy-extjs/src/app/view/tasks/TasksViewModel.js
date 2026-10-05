import { T } from '../../i18n.js';

Ext.define('Tasks.view.tasks.TasksViewModel', {
  extend: 'Ext.app.ViewModel',
  alias: 'viewmodel.tasks',

  data: {
    selectedTask: null,
    statusFilter: 'all',
    searchText: '',
  },

  stores: {
    tasks: 'tasks',
  },

  formulas: {
    hasSelection: function (get) {
      return Boolean(get('selectedTask'));
    },
    detailTitle: function (get) {
      const task = get('selectedTask');
      return task ? T('tasks.form.editTitle', task.get('title')) : T('tasks.form.emptyTitle');
    },
  },
});
