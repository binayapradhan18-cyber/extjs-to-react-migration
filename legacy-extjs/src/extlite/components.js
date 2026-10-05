import { Ext, capitalize } from './core.js';

const components = new Map();
Ext.ComponentManager = {
  get: (id) => components.get(id) ?? null,
};
Ext.getCmp = (id) => Ext.ComponentManager.get(id);

const toPx = (v) => (typeof v === 'number' ? `${v}px` : v);
const SELECTOR = /^(\*|[\w.-]+)?(?:#([\w-]+))?(?:\[(\w+)=["']?([^\]"']+)["']?\])?$/;

function matches(cmp, selector) {
  const m = SELECTOR.exec(selector.trim());
  if (!m) throw new Error(`[ExtLite] Unsupported selector "${selector}"`);
  const [, xtype, itemId, attr, value] = m;
  if (xtype && xtype !== '*' && !cmp.$xtypes.includes(xtype)) return false;
  if (itemId && cmp.itemId !== itemId && cmp.id !== itemId) return false;
  if (attr && String(cmp[attr]) !== value) return false;
  return true;
}


Ext.define('Ext.Component', {
  mixins: ['Ext.mixin.Observable'],
  alias: 'widget.component',
  config: { html: null, hidden: false, disabled: false },
  isComponent: true,
  autoEl: 'div',
  baseCls: 'x-component',
  cls: '',
  style: null,
  width: null,
  height: null,
  flex: null,
  itemId: null,
  reference: null,
  renderTo: null,
  ownerCt: null,
  rendered: false,
  el: null,
  bind: null,
  controller: null,
  viewModel: null,
  defaultBindProperty: 'html',

  constructor(config = {}) {
    this.id = config.id ?? Ext.id(null, 'ext-comp-');
    this.callParent([config]);
    components.set(this.id, this);
    this.initViewModel();
    this.initController();
    this.initComponent();
    this.initListeners();
    if (this.renderTo) this.render(this.renderTo);
  },

  initComponent() {},

  initViewModel() {
    if (!this.viewModel) return;
    this.viewModel = this.viewModel.isViewModel ? this.viewModel : Ext.createByAlias('viewmodel', this.viewModel);
    this.viewModel.view = this;
    this.ownsViewModel = true;
  },

  initController() {
    if (!this.controller) return;
    this.controller = this.controller.isViewController
      ? this.controller
      : Ext.createByAlias('controller', this.controller);
    this.controller.view = this;
  },

  lookupViewModel() {
    for (let c = this; c; c = c.ownerCt) if (c.viewModel?.isViewModel) return c.viewModel;
    return null;
  },
  lookupController() {
    for (let c = this; c; c = c.ownerCt) if (c.controller?.isViewController) return c.controller;
    return null;
  },
  resolveHandler(name, scope) {
    if (scope && typeof scope[name] === 'function') return { fn: scope[name], scope };
    const controller = this.lookupController();
    if (controller && typeof controller[name] === 'function') return { fn: controller[name], scope: controller };
    if (typeof this[name] === 'function') return { fn: this[name], scope: this };
    throw new Error(`[ExtLite] Unable to resolve handler "${name}" from ${this.$className}`);
  },

  getRefItems() {
    return [];
  },
  query(selector = '*') {
    const out = [];
    const walk = (cmp) => {
      for (const child of cmp.getRefItems()) {
        if (matches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  },
  down(selector) {
    return this.query(selector)[0] ?? null;
  },
  up(selector) {
    for (let c = this.ownerCt; c; c = c.ownerCt) if (!selector || matches(c, selector)) return c;
    return null;
  },
  is(selector) {
    return matches(this, selector);
  },
  lookupReference(reference) {
    return this.down(`[reference=${reference}]`);
  },

  getEl() {
    return this.el;
  },
  getContentTarget() {
    return this.el;
  },

  render(container) {
    if (this.rendered) return this;
    const target =
      typeof container === 'string'
        ? (document.getElementById(container) ?? document.querySelector(container))
        : container;
    if (!target) throw new Error(`[ExtLite] render target "${container}" not found`);
    const el = document.createElement(this.autoEl);
    el.id = this.id;
    el.className = [this.baseCls, this.cls].filter(Boolean).join(' ');
    if (typeof this.style === 'string') el.style.cssText = this.style;
    else if (this.style) Object.assign(el.style, this.style);
    if (this.width != null) el.style.width = toPx(this.width);
    if (this.height != null) el.style.height = toPx(this.height);
    if (this.flex != null) el.style.flex = `${this.flex} 1 0`;
    this.el = el;
    this.onRender(el);
    const html = this.getHtml();
    if (html != null) this.getContentTarget().innerHTML = html;
    if (this.getHidden()) el.style.display = 'none';
    if (this.getDisabled()) this.applyDisabledState(true);
    target.appendChild(el);
    this.rendered = true;
    if (this.ownsViewModel && this.ownerCt && !this.viewModel.parent) {
      this.viewModel.parent = this.ownerCt.lookupViewModel();
    }
    this.initBindings();
    this.afterRender();
    if (this.controller?.isViewController && this.controller.view === this) this.controller.initView(this);
    this.fireEvent('afterrender', this);
    return this;
  },
  onRender() {},
  afterRender() {},

  initBindings() {
    if (!this.bind) return;
    const vm = this.lookupViewModel();
    if (!vm) throw new Error(`[ExtLite] ${this.$className} declares bind but has no ViewModel`);
    const specs = typeof this.bind === 'string' ? { [this.defaultBindProperty]: this.bind } : this.bind;
    this.bindings = [];
    this.twoWay = {};
    for (const [prop, expr] of Object.entries(specs)) {
      const setter = `set${capitalize(prop)}`;
      if (typeof this[setter] !== 'function') throw new Error(`[ExtLite] ${this.$className} cannot bind "${prop}"`);
      this.bindings.push(vm.bind(expr, (value) => this[setter](value)));
      const path = Ext.app.ViewModel.bindPath(expr);
      if (path) this.twoWay[prop] = { vm, path };
    }
  },

  publishState(prop, value) {
    const target = this.twoWay?.[prop];
    if (target) target.vm.set(target.path, value);
  },

  updateHtml(html) {
    if (this.rendered) this.getContentTarget().innerHTML = html ?? '';
  },
  updateHidden(hidden) {
    if (this.el) this.el.style.display = hidden ? 'none' : '';
  },
  updateDisabled(disabled) {
    if (this.el) this.applyDisabledState(disabled);
  },
  applyDisabledState(disabled) {
    this.el.classList.toggle('x-disabled', Boolean(disabled));
    this.el.setAttribute('aria-disabled', String(Boolean(disabled)));
  },
  show() {
    return this.setHidden(false);
  },
  hide() {
    return this.setHidden(true);
  },

  setSize(width, height) {
    if (width !== undefined) this.width = width;
    if (height !== undefined) this.height = height;
    if (this.el) {
      if (width != null) this.el.style.width = toPx(width);
      if (height != null) this.el.style.height = toPx(height);
      this.notifyResize(width ?? this.el.offsetWidth, height ?? this.el.offsetHeight);
    }
    return this;
  },
  syncSize() {
    if (!this.el) return;
    const rect = this.el.getBoundingClientRect();
    this.notifyResize(Math.round(rect.width), Math.round(rect.height));
  },
  notifyResize(width, height) {
    const oldWidth = this.lastWidth;
    const oldHeight = this.lastHeight;
    if (width === oldWidth && height === oldHeight) return;
    this.lastWidth = width;
    this.lastHeight = height;
    this.onResize(width, height, oldWidth, oldHeight);
    this.fireEvent('resize', this, width, height, oldWidth, oldHeight);
  },
  onResize() {},

  destroy() {
    if (this.isDestroyed || this.isDestroying) return;
    if (this.fireEvent('beforedestroy', this) === false) return;
    this.isDestroying = true;
    this.onDestroy();
    this.ownerCt?.remove(this, false);
    this.bindings?.forEach((b) => b.destroy());
    this.bindings = null;
    if (this.controller?.isViewController && this.controller.view === this) this.controller.destroy();
    if (this.ownsViewModel) this.viewModel.destroy();
    this.el?.remove();
    this.el = null;
    this.fireEvent('destroy', this);
    this.clearListeners();
    components.delete(this.id);
    this.isDestroyed = true;
  },
  onDestroy() {},
});

Ext.define('Ext.container.Container', {
  extend: 'Ext.Component',
  alias: 'widget.container',
  baseCls: 'x-container',
  layout: null,
  defaults: null,
  defaultType: 'component',
  items: null,

  initComponent() {
    this.callParent();
    const configs = this.items ?? [];
    this.items = [];
    configs.forEach((item) => this.add(item));
  },

  lookupComponent(item) {
    if (item?.isComponent) return item;
    const config = { ...this.defaults, ...item };
    return Ext.widget(config.xtype ?? this.defaultType, config);
  },

  add(item) {
    const cmp = this.lookupComponent(item);
    cmp.ownerCt = this;
    if (this.getDisabled()) cmp.setDisabled(true);
    this.items.push(cmp);
    if (this.rendered) {
      cmp.render(this.getTargetEl());
      cmp.syncSize();
    }
    this.fireEvent('add', this, cmp);
    return cmp;
  },

  remove(cmp, destroy = true) {
    const index = this.items.indexOf(cmp);
    if (index === -1) return cmp;
    this.items.splice(index, 1);
    cmp.ownerCt = null;
    if (destroy) cmp.destroy();
    this.fireEvent('remove', this, cmp);
    return cmp;
  },

  removeAll(destroy = true) {
    [...this.items].forEach((cmp) => this.remove(cmp, destroy));
  },

  getRefItems() {
    return [...(this.dockedItems ?? []), ...(this.items ?? [])];
  },
  getTargetEl() {
    return this.el;
  },

  onRender() {
    const layout = this.layout?.type ?? this.layout;
    if (layout) this.getTargetEl().classList.add(`x-layout-${layout}`);
    this.items.forEach((cmp) => cmp.render(this.getTargetEl()));
  },

  onResize() {
    this.getRefItems().forEach((cmp) => cmp.syncSize());
  },

  updateDisabled(disabled) {
    this.callParent([disabled]);
    this.getRefItems()
      .filter((cmp) => cmp.isComponent)
      .forEach((cmp) => cmp.setDisabled(disabled));
  },

  onDestroy() {
    [...this.items].forEach((cmp) => cmp.destroy());
    this.callParent();
  },
});

Ext.define('Ext.toolbar.TextItem', {
  extend: 'Ext.Component',
  alias: 'widget.tbtext',
  baseCls: 'x-toolbar-text',
});

Ext.define('Ext.toolbar.Toolbar', {
  extend: 'Ext.container.Container',
  alias: 'widget.toolbar',
  baseCls: 'x-toolbar',
  layout: 'hbox',
  defaultType: 'button',

  lookupComponent(item) {
    if (item === '->') return Ext.widget('component', { cls: 'x-toolbar-fill', flex: 1 });
    if (typeof item === 'string') return Ext.widget('tbtext', { html: Ext.String.htmlEncode(item) });
    return this.callParent([item]);
  },
});

Ext.define('Ext.panel.Panel', {
  extend: 'Ext.container.Container',
  alias: 'widget.panel',
  config: { title: null },
  baseCls: 'x-panel',
  defaultBindProperty: 'title',
  header: true,
  tbar: null,
  bbar: null,
  bodyPadding: null,

  initComponent() {
    this.dockedItems = [];
    if (this.tbar) this.tbarCmp = this.addDocked(this.tbar, 'top');
    if (this.bbar) this.bbarCmp = this.addDocked(this.bbar, 'bottom');
    this.callParent();
  },

  addDocked(spec, dock) {
    const config = Array.isArray(spec) ? { items: spec } : spec;
    const toolbar = Ext.widget(config.xtype ?? 'toolbar', { ...config, cls: `x-docked-${dock} ${config.cls ?? ''}` });
    toolbar.ownerCt = this;
    this.dockedItems.push(toolbar);
    return toolbar;
  },

  onRender(el) {
    if (this.header !== false) {
      this.headerEl = document.createElement('div');
      this.headerEl.className = 'x-panel-header';
      this.titleEl = document.createElement('span');
      this.titleEl.className = 'x-panel-title';
      this.headerEl.append(this.titleEl);
      el.append(this.headerEl);
      this.updateTitle(this.getTitle());
    }
    this.tbarCmp?.render(el);
    this.body = document.createElement('div');
    this.body.className = 'x-panel-body';
    if (this.bodyPadding != null) this.body.style.padding = toPx(this.bodyPadding);
    el.append(this.body);
    this.bbarCmp?.render(el);
    this.callParent([el]);
  },

  getTargetEl() {
    return this.body ?? this.el;
  },
  getContentTarget() {
    return this.body ?? this.el;
  },

  updateTitle(title) {
    if (!this.titleEl) return;
    this.titleEl.textContent = title ?? '';
    this.headerEl.style.display = title == null ? 'none' : '';
  },

  onDestroy() {
    this.dockedItems.forEach((d) => d.destroy());
    this.dockedItems = [];
    this.callParent();
  },
});

Ext.define('Ext.button.Button', {
  extend: 'Ext.Component',
  alias: 'widget.button',
  config: { text: '' },
  autoEl: 'button',
  baseCls: 'x-btn',
  defaultBindProperty: 'text',
  handler: null,
  scope: null,
  ui: null,

  onRender(el) {
    el.type = 'button';
    if (this.ui) el.classList.add(`x-btn-${this.ui}`);
    el.textContent = this.getText() ?? '';
    this.clickListener = (e) => this.onClick(e);
    el.addEventListener('click', this.clickListener);
  },
  updateText(text) {
    if (this.el) this.el.textContent = text ?? '';
  },
  applyDisabledState(disabled) {
    this.callParent([disabled]);
    this.el.disabled = Boolean(disabled);
  },
  onClick(e) {
    if (this.getDisabled() || this.fireEvent('click', this, e) === false || !this.handler) return;
    const { fn, scope } =
      typeof this.handler === 'string'
        ? this.resolveHandler(this.handler, this.scope)
        : { fn: this.handler, scope: this.scope ?? this };
    fn.call(scope, this, e);
  },
  onDestroy() {
    this.el?.removeEventListener('click', this.clickListener);
    this.callParent();
  },
});

Ext.define('Ext.form.field.Base', {
  extend: 'Ext.Component',
  alias: 'widget.field',
  config: { value: null, fieldLabel: null },
  baseCls: 'x-field',
  defaultBindProperty: 'value',
  isFormField: true,
  name: null,
  inputType: 'text',
  inputEvent: 'input',
  allowBlank: true,
  blankText: 'This field is required',
  emptyText: '',

  onRender(el) {
    const inputId = `${this.id}-input`;
    this.labelEl = document.createElement('label');
    this.labelEl.className = 'x-field-label';
    this.labelEl.htmlFor = inputId;
    this.inputEl = this.createInput();
    this.inputEl.id = inputId;
    this.inputEl.classList.add('x-field-input');
    if (this.name) this.inputEl.name = this.name;
    this.errorEl = document.createElement('div');
    this.errorEl.className = 'x-field-error';
    el.append(this.labelEl, this.inputEl, this.errorEl);
    this.updateFieldLabel(this.getFieldLabel());
    this.writeRaw(this.getValue());
    this.inputListener = () => this.onUserInput();
    this.inputEl.addEventListener(this.inputEvent, this.inputListener);
  },
  createInput() {
    const input = document.createElement('input');
    input.type = this.inputType;
    if (this.emptyText) input.placeholder = this.emptyText;
    return input;
  },

  // Ext fires change for programmatic setValue too; ExtLite only for user input to keep binding loops trivial.
  onUserInput() {
    const old = this.getValue();
    const value = this.rawToValue(this.inputEl.value);
    this.setValue(value);
    this.publishState('value', value);
    this.clearInvalid();
    this.fireEvent('change', this, value, old);
  },
  rawToValue(raw) {
    return raw;
  },
  valueToRaw(value) {
    return value === null || value === undefined ? '' : String(value);
  },
  writeRaw(value) {
    if (!this.inputEl) return;
    const raw = this.valueToRaw(value);
    if (this.inputEl.value !== raw) this.inputEl.value = raw;
  },
  updateValue(value) {
    this.writeRaw(value);
  },
  updateFieldLabel(label) {
    if (!this.labelEl) return;
    this.labelEl.textContent = label ?? '';
    this.labelEl.style.display = label ? '' : 'none';
  },
  applyDisabledState(disabled) {
    this.callParent([disabled]);
    if (this.inputEl) this.inputEl.disabled = Boolean(disabled);
  },
  isEmptyValue(value) {
    return value === null || value === undefined || value === '';
  },
  validate() {
    if (!this.allowBlank && this.isEmptyValue(this.getValue())) {
      this.markInvalid(this.blankText);
      return false;
    }
    this.clearInvalid();
    return true;
  },
  isValid() {
    return this.getDisabled() || this.validate();
  },
  markInvalid(message) {
    this.activeError = message;
    this.el?.classList.add('x-field-invalid');
    if (this.errorEl) this.errorEl.textContent = message;
  },
  clearInvalid() {
    this.activeError = null;
    this.el?.classList.remove('x-field-invalid');
    if (this.errorEl) this.errorEl.textContent = '';
  },
  onDestroy() {
    this.inputEl?.removeEventListener(this.inputEvent, this.inputListener);
    this.callParent();
  },
});

Ext.define('Ext.form.field.Text', {
  extend: 'Ext.form.field.Base',
  alias: 'widget.textfield',
});

Ext.define('Ext.form.field.Number', {
  extend: 'Ext.form.field.Base',
  alias: 'widget.numberfield',
  inputType: 'number',
  step: 1,
  minValue: null,
  createInput() {
    const input = this.callParent();
    input.step = String(this.step);
    if (this.minValue != null) input.min = String(this.minValue);
    return input;
  },
  rawToValue(raw) {
    return raw === '' ? null : Number(raw);
  },
});

Ext.define('Ext.form.field.Date', {
  extend: 'Ext.form.field.Base',
  alias: 'widget.datefield',
  inputType: 'date',
  rawToValue(raw) {
    return raw ? Ext.Date.parse(raw, 'Y-m-d') : null;
  },
  valueToRaw(value) {
    return value instanceof Date ? Ext.Date.format(value, 'Y-m-d') : (value ?? '');
  },
});

Ext.define('Ext.form.field.ComboBox', {
  extend: 'Ext.form.field.Base',
  alias: ['widget.combobox', 'widget.combo'],
  inputEvent: 'change',
  store: null,

  createInput() {
    const select = document.createElement('select');
    this.options = (this.store ?? []).map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o));
    for (const option of this.options) select.add(new Option(option.label, String(option.value)));
    return select;
  },
  rawToValue(raw) {
    return this.options.find((o) => String(o.value) === raw)?.value ?? null;
  },
});

Ext.define('Ext.form.Panel', {
  extend: 'Ext.panel.Panel',
  alias: 'widget.form',
  baseCls: 'x-panel x-form',
  record: null,

  getFields() {
    return this.items.flatMap((item) => (item.isFormField ? [item] : item.query('field')));
  },
  loadRecord(record) {
    this.record = record;
    for (const field of this.getFields()) {
      if (!field.name) continue;
      field.setValue(record.get(field.name));
      field.clearInvalid();
    }
    this.fireEvent('loadrecord', this, record);
    return this;
  },
  getRecord() {
    return this.record;
  },
  getValues() {
    return Object.fromEntries(this.getFields().filter((f) => f.name).map((f) => [f.name, f.getValue()]));
  },
  updateRecord(record = this.record) {
    record?.set(this.getValues());
    return this;
  },
  isValid() {
    return this.getFields()
      .map((f) => f.isValid())
      .every(Boolean);
  },
  markErrors(errors) {
    for (const field of this.getFields()) if (errors[field.name]) field.markInvalid(errors[field.name]);
  },
  reset() {
    if (this.record) this.loadRecord(this.record);
  },
});

Ext.define('Ext.grid.Panel', {
  extend: 'Ext.panel.Panel',
  alias: ['widget.grid', 'widget.gridpanel'],
  config: { store: null, selection: null },
  baseCls: 'x-panel x-grid',
  defaultBindProperty: 'store',
  columns: [],
  emptyText: 'No data to display',

  applyStore(store) {
    if (typeof store === 'string') return Ext.getStore(store) ?? null;
    if (store && !store.isStore) return Ext.create('Ext.data.Store', store);
    return store;
  },
  updateStore(store, old) {
    this.storeListeners ??= {
      datachanged: () => this.refreshView(),
      update: (_store, record) => this.refreshRow(record),
    };
    if (old) for (const [event, fn] of Object.entries(this.storeListeners)) old.un(event, fn);
    if (store) for (const [event, fn] of Object.entries(this.storeListeners)) store.on(event, fn);
    this.refreshView();
  },
  updateSelection(record) {
    this.syncSelection();
    if (!this.rendered) return;
    this.fireEvent('select', this, record);
    this.fireEvent('selectionchange', this, record ? [record] : []);
  },

  onRender(el) {
    this.callParent([el]);
    const table = document.createElement('table');
    table.className = 'x-grid-table';
    table.setAttribute('role', 'grid');
    this.headEl = table.createTHead();
    this.bodyEl = table.createTBody();
    this.getTargetEl().append(table);
    this.headerClick = (e) => {
      const th = e.target.closest('th[data-sortable="true"]');
      if (th) this.getStore()?.sort(th.dataset.dataIndex);
    };
    this.rowClick = (e) => {
      const tr = e.target.closest('tr.x-grid-row');
      const record = tr && this.getStore()?.getById(tr.dataset.recordId);
      if (!record || this.getDisabled() || this.fireEvent('beforeselect', this, record) === false) return;
      this.setSelection(record);
      this.publishState('selection', record);
    };
    this.headEl.addEventListener('click', this.headerClick);
    this.bodyEl.addEventListener('click', this.rowClick);
    this.refreshView();
  },

  renderHeader() {
    const sorter = this.getStore()?.sorters?.[0];
    const row = document.createElement('tr');
    for (const column of this.columns) {
      const th = document.createElement('th');
      th.textContent = column.text ?? '';
      if (column.width) th.style.width = toPx(column.width);
      if (column.align) th.style.textAlign = column.align;
      if (column.dataIndex && column.sortable !== false) {
        th.dataset.sortable = 'true';
        th.dataset.dataIndex = column.dataIndex;
        if (sorter?.property === column.dataIndex) {
          th.classList.add(`x-column-sort-${sorter.direction.toLowerCase()}`);
          th.setAttribute('aria-sort', sorter.direction === 'ASC' ? 'ascending' : 'descending');
        }
      }
      row.append(th);
    }
    this.headEl.replaceChildren(row);
  },

  refreshView() {
    if (!this.bodyEl) return;
    this.renderHeader();
    const records = this.getStore()?.getRange() ?? [];
    this.bodyEl.innerHTML = records.length
      ? records.map((r) => this.renderRow(r)).join('')
      : `<tr class="x-grid-empty"><td colspan="${this.columns.length}">${Ext.String.htmlEncode(this.emptyText)}</td></tr>`;
    this.syncSelection();
  },

  renderRow(record) {
    const cells = this.columns.map((column) => this.renderCell(column, record)).join('');
    return `<tr class="x-grid-row" data-record-id="${Ext.String.htmlEncode(record.getId())}">${cells}</tr>`;
  },

  // Renderers return raw HTML (as in Ext); unrendered values are encoded by default.
  renderCell(column, record) {
    const value = column.dataIndex ? record.get(column.dataIndex) : undefined;
    const meta = { tdCls: '' };
    const html = column.renderer
      ? column.renderer.call(column.scope ?? this, value, meta, record)
      : Ext.String.htmlEncode(value ?? '');
    const align = column.align ? ` style="text-align:${column.align}"` : '';
    return `<td class="x-grid-cell ${meta.tdCls}"${align}>${html ?? ''}</td>`;
  },

  refreshRow(record) {
    const row = [...(this.bodyEl?.rows ?? [])].find((tr) => tr.dataset.recordId === String(record.getId()));
    if (!row) return;
    const tmp = document.createElement('tbody');
    tmp.innerHTML = this.renderRow(record);
    row.replaceWith(tmp.firstElementChild);
    this.syncSelection();
  },

  syncSelection() {
    if (!this.bodyEl) return;
    const id = this.getSelection()?.getId();
    for (const tr of this.bodyEl.rows) {
      const selected = id !== undefined && tr.dataset.recordId === String(id);
      tr.classList.toggle('x-grid-row-selected', selected);
      if (tr.classList.contains('x-grid-row')) tr.setAttribute('aria-selected', String(selected));
    }
  },

  onDestroy() {
    const store = this.getStore();
    if (store && this.storeListeners) for (const [event, fn] of Object.entries(this.storeListeners)) store.un(event, fn);
    this.headEl?.removeEventListener('click', this.headerClick);
    this.bodyEl?.removeEventListener('click', this.rowClick);
    this.callParent();
  },
});

Ext.define('Ext.container.Viewport', {
  extend: 'Ext.container.Container',
  alias: 'widget.viewport',
  baseCls: 'x-viewport',

  initComponent() {
    this.renderTo = this.renderTo ?? document.body;
    this.callParent();
  },
  afterRender() {
    this.callParent();
    this.windowResize = () => this.syncSize();
    window.addEventListener('resize', this.windowResize);
    this.syncSize();
  },
  onDestroy() {
    window.removeEventListener('resize', this.windowResize);
    this.callParent();
  },
});
