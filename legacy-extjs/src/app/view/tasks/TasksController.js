import { T } from '../../i18n.js';

Ext.define('Tasks.view.tasks.TasksController', {
  extend: 'Ext.app.ViewController',
  alias: 'controller.tasks',

  listen: {
    global: {
      shellsearch: 'onShellSearch',
      taskselect: 'onExternalSelect',
      tasksaved: 'onTaskSaved',
    },
    component: {
      taskgrid: { selectionchange: 'onSelectionChange' },
    },
  },

  init() {
    const store = this.getStore('tasks');
    if (!store.getCount() && !store.isLoading()) store.load();
    const vm = this.getViewModel();
    if (vm.get('statusFilter') !== 'all' || vm.get('searchText')) this.applyFilters();
  },

  applyFilters() {
    const vm = this.getViewModel();
    const status = vm.get('statusFilter');
    this.getStore('tasks').filter([
      { property: 'status', value: status === 'all' ? null : status },
      { property: 'title', value: vm.get('searchText'), operator: 'like' },
    ]);
  },

  onFilterChange() {
    this.applyFilters();
  },

  onShellSearch(text) {
    this.getViewModel().set('searchText', text ?? '');
    this.applyFilters();
  },

  onRefresh() {
    this.getStore('tasks').load();
  },

  onSelectionChange(grid, records) {
    const record = records[0] ?? null;
    if (record) this.lookupReference('taskForm').loadRecord(record);
    Ext.GlobalEvents.fireEvent('taskselect', record ? record.getData() : null);
  },

  onExternalSelect(data) {
    const grid = this.lookupReference('taskGrid');
    const id = data ? String(data.id) : null;
    if (!id || grid.getSelection()?.getId() === id) return;
    const record = this.getStore('tasks').getById(id);
    if (!record) return;
    grid.setSelection(record);
    grid.publishState('selection', record);
  },

  // Runs after the shell has written the save into the shared store.
  onTaskSaved(task) {
    queueMicrotask(() => {
      const form = this.lookupReference('taskForm');
      const record = form?.getRecord();
      if (record && record.getId() === task.id) form.loadRecord(record);
    });
  },

  onSave() {
    const form = this.lookupReference('taskForm');
    const record = form.getRecord();
    if (!record || !form.isValid()) return;
    const previous = record.getData();
    form.updateRecord(record);
    const { isValid, errors } = record.validate();
    if (!isValid) {
      record.set(previous);
      form.markErrors(errors);
      return;
    }
    record.commit();
    this.getViewModel().notify();
    Ext.toast(T('tasks.form.saved'));
    Ext.GlobalEvents.fireEvent('tasksaved', record.getData());
  },

  onReset() {
    this.lookupReference('taskForm').reset();
  },
});
