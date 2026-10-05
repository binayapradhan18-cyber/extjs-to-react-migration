import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Ext } from '../src/extlite/index.js';
import '../src/app/model/Task.js';
import '../src/app/store/Tasks.js';

describe('ExtLite class system', () => {
  it('supports extend, config accessors with apply/update hooks, mixins and callParent', () => {
    const log = [];
    Ext.define('Spec.Greeter', {
      config: { name: 'world' },
      applyName: (v) => String(v).trim(),
      updateName(value, old) {
        log.push(`${old}->${value}`);
      },
      greet() {
        return `Hello ${this.getName()}`;
      },
    });
    Ext.define('Spec.Loud', {
      shout() {
        return this.greet().toUpperCase();
      },
    });
    Ext.define('Spec.Polite', {
      extend: 'Spec.Greeter',
      mixins: { loud: 'Spec.Loud' },
      greet() {
        return `${this.callParent()}, please`;
      },
    });

    const polite = Ext.create('Spec.Polite', { name: '  Ext  ' });
    expect(polite.greet()).toBe('Hello Ext, please');
    expect(polite.shout()).toBe('HELLO EXT, PLEASE');
    expect(polite.mixins.loud).toBeDefined();
    polite.setName('React');
    expect(log).toEqual(['undefined->Ext', 'Ext->React']);
    expect(globalThis.Spec.Polite).toBe(Ext.ClassManager.get('Spec.Polite'));
  });
});

describe('ExtLite data package', () => {
  afterEach(() => Ext.getStore('tasks')?.destroy());

  const rows = [
    { id: '1', title: 'Beta', status: 'todo', priority: 2, dueDate: '2026-10-10', estimateHours: 1 },
    { id: '2', title: 'alpha', status: 'done', priority: 1, dueDate: null, estimateHours: 2 },
    { id: '3', title: 'Gamma', status: 'todo', priority: 4, dueDate: '2026-10-01', estimateHours: 3 },
  ];

  it('converts fields, computes calculated fields and validates', () => {
    const task = Ext.create('Tasks.model.Task', { id: 'x', title: '', priority: '3', dueDate: '2000-01-01' });
    expect(task.get('priority')).toBe(3);
    expect(task.get('status')).toBe('todo');
    expect(task.get('dueDate')).toBeInstanceOf(Date);
    expect(task.get('isOverdue')).toBe(true);
    expect(task.validate()).toEqual({ isValid: false, errors: { title: 'This field is required' } });
    task.set('status', 'done');
    expect(task.get('isOverdue')).toBe(false);
    expect(task.isDirty()).toBe(true);
  });

  it('loads through an ajax proxy, sorts (nulls last) and filters', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: rows }))));
    const store = Ext.create('Tasks.store.Tasks');
    const onLoad = vi.fn();
    store.on('load', onLoad);

    await store.load();

    expect(onLoad).toHaveBeenCalledWith(store, expect.any(Array), true);
    expect(store.getRange().map((r) => r.getId())).toEqual(['3', '1', '2']);
    store.sort('title', 'ASC');
    expect(store.getRange().map((r) => r.get('title'))).toEqual(['alpha', 'Beta', 'Gamma']);
    store.filter([
      { property: 'status', value: 'todo' },
      { property: 'title', value: 'GAM', operator: 'like' },
    ]);
    expect(store.getCount()).toBe(1);
    store.clearFilter();
    expect(store.getCount()).toBe(3);
    vi.unstubAllGlobals();
  });

  it('notifies the store when a record is edited', () => {
    const store = Ext.create('Tasks.store.Tasks', { proxy: { type: 'memory' }, data: rows });
    const onUpdate = vi.fn();
    store.on('update', onUpdate);
    store.getById('1').set({ title: 'Beta 2', estimateHours: 1 });
    expect(onUpdate).toHaveBeenCalledWith(store, store.getById('1'), 'edit', ['title']);
  });
});

describe('ExtLite MVVM', () => {
  let root;
  beforeAll(() => {
    Ext.define('Spec.ViewModel', {
      extend: 'Ext.app.ViewModel',
      alias: 'viewmodel.spec',
      data: { name: 'Ext', show: false },
      formulas: { greeting: (get) => `Hi ${get('name')}` },
    });
    Ext.define('Spec.Controller', {
      extend: 'Ext.app.ViewController',
      alias: 'controller.spec',
      listen: {
        global: { specping: 'onPing' },
        component: { 'button[reference=go]': { click: 'onGoClick' } },
      },
      pings: 0,
      clicks: 0,
      onPing() {
        this.pings += 1;
      },
      onGoClick() {
        this.clicks += 1;
      },
      onHandler() {
        this.getViewModel().set('name', 'Handler');
      },
    });
  });

  afterEach(() => root?.destroy());

  function build() {
    const target = document.createElement('div');
    document.body.append(target);
    root = Ext.create('Ext.panel.Panel', {
      renderTo: target,
      controller: 'spec',
      viewModel: 'spec',
      bind: { title: '{greeting}' },
      items: [
        { xtype: 'textfield', reference: 'nameField', bind: '{name}' },
        { xtype: 'component', reference: 'secret', html: 'secret', bind: { hidden: '{!show}' } },
        { xtype: 'button', reference: 'go', text: 'Go', handler: 'onHandler' },
      ],
    });
    return root;
  }

  it('binds one-way and two-way through the ViewModel', () => {
    const panel = build();
    const field = panel.lookupReference('nameField');
    expect(panel.el.querySelector('.x-panel-title').textContent).toBe('Hi Ext');
    expect(panel.lookupReference('secret').el.style.display).toBe('none');

    field.inputEl.value = 'React';
    field.inputEl.dispatchEvent(new Event('input'));

    expect(panel.viewModel.get('name')).toBe('React');
    expect(panel.el.querySelector('.x-panel-title').textContent).toBe('Hi React');
    panel.viewModel.set('show', true);
    expect(panel.lookupReference('secret').el.style.display).toBe('');
  });

  it('resolves string handlers and listen domains on the ViewController', () => {
    const panel = build();
    const controller = panel.controller;
    panel.lookupReference('go').el.click();
    Ext.GlobalEvents.fireEvent('specping');

    expect(controller.clicks).toBe(1);
    expect(controller.pings).toBe(1);
    expect(panel.viewModel.get('name')).toBe('Handler');
  });

  it('destroy tears down children, controller listeners and DOM', () => {
    const panel = build();
    const controller = panel.controller;
    const childId = panel.lookupReference('go').id;
    panel.destroy();
    root = null;
    Ext.GlobalEvents.fireEvent('specping');

    expect(controller.pings).toBe(0);
    expect(Ext.getCmp(childId)).toBeNull();
    expect(document.querySelector('.x-panel')).toBeNull();
  });
});

describe('ExtLite grid', () => {
  it('renders store rows, sorts on header click and selects on row click', () => {
    const store = Ext.create('Ext.data.Store', {
      data: [
        { id: 'a', name: 'Zed' },
        { id: 'b', name: '<b>Amy</b>' },
      ],
    });
    const target = document.createElement('div');
    document.body.append(target);
    const grid = Ext.create('Ext.grid.Panel', {
      renderTo: target,
      store,
      columns: [{ text: 'Name', dataIndex: 'name' }],
    });
    const onSelect = vi.fn();
    grid.on('selectionchange', onSelect);

    const names = () => [...grid.el.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(names()).toEqual(['Zed', '<b>Amy</b>']);
    grid.el.querySelector('th').click();
    expect(names()).toEqual(['<b>Amy</b>', 'Zed']);
    grid.el.querySelector('tbody tr').click();
    expect(onSelect).toHaveBeenCalledWith(grid, [store.getById('b')]);
    expect(grid.el.querySelector('tbody tr').getAttribute('aria-selected')).toBe('true');

    grid.destroy();
    expect(store.hasListener('datachanged')).toBe(false);
  });
});
