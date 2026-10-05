import { Ext, hasOwn } from './core.js';

const converters = {
  auto: (v) => v,
  string: (v, f) => (v === null || v === undefined ? (f.allowNull ? null : '') : String(v)),
  int: (v, f) => toNumber(v, f, (x) => parseInt(x, 10)),
  float: (v, f) => toNumber(v, f, parseFloat),
  boolean: (v) => v === true || v === 'true' || v === 1 || v === '1',
  date: (v, f) => {
    if (v instanceof Date) return v;
    if (v === null || v === undefined || v === '') return null;
    return Ext.Date.parse(String(v), f.dateFormat);
  },
};
converters.number = converters.float;
converters.bool = converters.boolean;

function toNumber(v, field, parse) {
  if (v === null || v === undefined || v === '') return field.allowNull ? null : 0;
  const n = typeof v === 'number' ? v : parse(v);
  return Number.isNaN(n) ? (field.allowNull ? null : 0) : n;
}

const validators = {
  presence: (v, c) => (v !== null && v !== undefined && v !== '') || (c.message ?? 'This field is required'),
  length: (v, c) => {
    const n = v === null || v === undefined ? 0 : String(v).length;
    if (c.min != null && n < c.min) return c.minOnlyMessage ?? `Must be at least ${c.min} characters`;
    if (c.max != null && n > c.max) return c.maxOnlyMessage ?? `Must be at most ${c.max} characters`;
    return true;
  },
  inclusion: (v, c) => c.list.includes(v) || (c.message ?? 'Is not an allowed value'),
  range: (v, c) => {
    if (v === null || v === undefined) return true;
    if (c.min != null && v < c.min) return `Must be at least ${c.min}`;
    if (c.max != null && v > c.max) return `Must be at most ${c.max}`;
    return true;
  },
  format: (v, c) => v === null || v === undefined || v === '' || c.matcher.test(v) || (c.message ?? 'Is in the wrong format'),
  email: (v, c) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || (c.message ?? 'Is not a valid email address'),
};

const sameValue = (a, b) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

function normalizeField(def) {
  const field = { type: 'auto', allowNull: false, persist: true, ...def };
  const convert = converters[field.type] ?? converters.auto;
  field.convert = (value) => convert(value, field);
  return field;
}

Ext.define('Ext.data.Model', {
  idProperty: 'id',
  fields: [],
  validators: null,
  isModel: true,

  constructor(data = {}) {
    this.data = { ...data };
    this.modified = {};
    this.store = null;
    for (const field of this.getFields()) {
      if (field.calculate) continue;
      this.data[field.name] = field.convert(data[field.name] !== undefined ? data[field.name] : field.defaultValue);
    }
    this.phantom = data[this.idProperty] === null || data[this.idProperty] === undefined;
    if (this.phantom) this.data[this.idProperty] = Ext.id(null, 'ext-record-');
    this.runCalculated();
    this.id = this.data[this.idProperty];
  },

  getFields() {
    const proto = Object.getPrototypeOf(this);
    if (!hasOwn(proto, '$fields')) {
      const chain = [];
      for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
        if (hasOwn(p, 'fields')) chain.unshift(p.fields);
      }
      const byName = new Map();
      for (const f of chain.flat()) {
        const def = typeof f === 'string' ? { name: f } : f;
        byName.set(def.name, normalizeField(def));
      }
      if (!byName.has(proto.idProperty)) byName.set(proto.idProperty, normalizeField({ name: proto.idProperty }));
      proto.$fields = [...byName.values()];
    }
    return proto.$fields;
  },

  runCalculated() {
    for (const field of this.getFields()) {
      if (field.calculate) this.data[field.name] = field.calculate(this.data);
    }
  },

  get(name) {
    return this.data[name];
  },
  getId() {
    return this.id;
  },
  getData() {
    return { ...this.data };
  },

  set(fieldName, value) {
    const values = typeof fieldName === 'string' ? { [fieldName]: value } : fieldName;
    const fields = new Map(this.getFields().map((f) => [f.name, f]));
    const changed = [];
    for (const [name, raw] of Object.entries(values)) {
      const field = fields.get(name);
      if (field?.calculate || name === this.idProperty) continue;
      const next = field ? field.convert(raw) : raw;
      const prev = this.data[name];
      if (sameValue(prev, next)) continue;
      if (!hasOwn(this.modified, name)) this.modified[name] = prev;
      else if (sameValue(this.modified[name], next)) delete this.modified[name];
      this.data[name] = next;
      changed.push(name);
    }
    if (!changed.length) return null;
    this.runCalculated();
    this.store?.afterEdit(this, changed);
    return changed;
  },

  isDirty() {
    return Object.keys(this.modified).length > 0;
  },
  commit() {
    this.modified = {};
    this.phantom = false;
    this.store?.afterCommit(this);
  },

  validate() {
    const errors = {};
    for (const [field, specs] of Object.entries(this.validators ?? {})) {
      for (const spec of [].concat(specs)) {
        const config = typeof spec === 'string' ? { type: spec } : spec;
        const result = validators[config.type]?.(this.data[field], config) ?? true;
        if (result !== true) {
          errors[field] = result;
          break;
        }
      }
    }
    return { isValid: Object.keys(errors).length === 0, errors };
  },
});

const stores = new Map();
Ext.data.StoreManager = {
  register: (store) => stores.set(store.storeId, store),
  unregister: (store) => stores.get(store.storeId) === store && stores.delete(store.storeId),
  lookup: (id) => (id?.isStore ? id : stores.get(id)),
};
Ext.getStore = (id) => Ext.data.StoreManager.lookup(id);

function matchFilter(filter, record) {
  if (filter.filterFn) return filter.filterFn.call(filter.scope, record);
  const value = record.get(filter.property);
  switch (filter.operator ?? '=') {
    case 'like':
      return String(value ?? '').toLowerCase().includes(String(filter.value).toLowerCase());
    case '!=':
      return value !== filter.value;
    default:
      return value === filter.value;
  }
}

function compareRecords(a, b, sorters) {
  for (const { property, direction } of sorters) {
    const av = a.get(property);
    const bv = b.get(property);
    if (av === bv) continue;
    // Nulls sort last in both directions; the React grid mirrors this for parity.
    if (av === null || av === undefined || av === '') return 1;
    if (bv === null || bv === undefined || bv === '') return -1;
    const dir = direction === 'DESC' ? -1 : 1;
    if (av instanceof Date) return (av.getTime() - bv.getTime()) * dir;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
  }
  return 0;
}

Ext.define('Ext.data.Store', {
  mixins: ['Ext.mixin.Observable'],
  alias: 'store.store',
  isStore: true,
  model: null,
  proxy: null,
  storeId: null,
  autoLoad: false,
  sorters: null,
  filters: null,
  data: null,

  constructor(config) {
    this.callParent([config]);
    this.sorters = (this.sorters ?? []).map((s) => (typeof s === 'string' ? { property: s, direction: 'ASC' } : { ...s }));
    this.filters = [...(this.filters ?? [])];
    this.allRecords = [];
    this.records = [];
    this.loading = false;
    this.initListeners();
    if (this.storeId) Ext.data.StoreManager.register(this);
    if (this.data) {
      const rows = this.data;
      this.data = null;
      this.loadRecords(rows);
    }
    if (this.autoLoad) this.load();
  },

  getModel() {
    if (typeof this.model === 'string') return Ext.ClassManager.get(this.model);
    return this.model ?? Ext.ClassManager.get('Ext.data.Model');
  },

  createRecord(data) {
    const record = data?.isModel ? data : new (this.getModel())(data);
    record.store = this;
    return record;
  },

  loadRecords(rows, append = false) {
    const records = rows.map((row) => this.createRecord(row));
    this.allRecords = append ? this.allRecords.concat(records) : records;
    this.applyView();
    this.fireEvent('datachanged', this);
    this.fireEvent('refresh', this);
  },
  loadData(rows, append) {
    this.loadRecords(rows, append);
  },

  load(options = {}) {
    if (this.fireEvent('beforeload', this, options) === false) return Promise.resolve(this.records);
    this.loading = true;
    return this.readProxy().then(
      (rows) => {
        this.loading = false;
        if (this.isDestroyed) return [];
        this.loadRecords(rows);
        this.fireEvent('load', this, this.records, true);
        options.callback?.call(options.scope, this.records, true);
        return this.records;
      },
      (error) => {
        this.loading = false;
        if (this.isDestroyed) return [];
        this.fireEvent('load', this, [], false, error);
        options.callback?.call(options.scope, [], false);
        return [];
      },
    );
  },

  readProxy() {
    const proxy = this.proxy ?? { type: 'memory', data: [] };
    if (proxy.type === 'memory') return Promise.resolve(proxy.data ?? []);
    if (proxy.type === 'ajax') {
      return Ext.Ajax.request({ url: proxy.url, params: proxy.extraParams }).then((res) => {
        const json = JSON.parse(res.responseText);
        const root = proxy.reader?.rootProperty;
        return root ? (json[root] ?? []) : json;
      });
    }
    return Promise.reject(new Error(`[ExtLite] Unsupported proxy type "${proxy.type}"`));
  },

  applyView() {
    let records = this.allRecords;
    if (this.filters.length) records = records.filter((r) => this.filters.every((f) => matchFilter(f, r)));
    if (this.sorters.length) records = [...records].sort((a, b) => compareRecords(a, b, this.sorters));
    this.records = records;
  },

  sort(property, direction) {
    if (Array.isArray(property)) {
      this.sorters = property.map((s) => ({ direction: 'ASC', ...s }));
    } else if (property) {
      const current = this.sorters[0];
      const toggled = current?.property === property && current.direction === 'ASC' ? 'DESC' : 'ASC';
      this.sorters = [{ property, direction: direction ?? toggled }];
    }
    this.applyView();
    this.fireEvent('sort', this, this.sorters);
    this.fireEvent('datachanged', this);
    this.fireEvent('refresh', this);
  },

  filter(property, value) {
    const specs = Array.isArray(property) ? property : typeof property === 'object' ? [property] : [{ property, value }];
    for (const spec of specs) {
      const id = spec.id ?? spec.property;
      this.filters = this.filters.filter((f) => (f.id ?? f.property) !== id);
      const active = spec.filterFn || (spec.value !== null && spec.value !== undefined && spec.value !== '');
      if (active) this.filters.push(spec);
    }
    this.refilter();
  },
  filterBy(fn, scope) {
    this.filter({ id: 'filterBy', filterFn: fn, scope });
  },
  clearFilter(suppressEvent) {
    this.filters = [];
    if (suppressEvent) this.applyView();
    else this.refilter();
  },
  refilter() {
    this.applyView();
    this.fireEvent('filterchange', this, this.filters);
    this.fireEvent('datachanged', this);
    this.fireEvent('refresh', this);
  },

  getCount() {
    return this.records.length;
  },
  getTotalCount() {
    return this.allRecords.length;
  },
  getAt(index) {
    return this.records[index];
  },
  getRange(start = 0, end) {
    return this.records.slice(start, end === undefined ? undefined : end + 1);
  },
  getById(id) {
    return this.allRecords.find((r) => String(r.getId()) === String(id)) ?? null;
  },

  add(items) {
    const records = [].concat(items).map((item) => this.createRecord(item));
    this.allRecords = this.allRecords.concat(records);
    this.applyView();
    this.fireEvent('add', this, records);
    this.fireEvent('datachanged', this);
    return records;
  },
  remove(items) {
    const removed = new Set([].concat(items));
    this.allRecords = this.allRecords.filter((r) => !removed.has(r));
    removed.forEach((r) => {
      r.store = null;
    });
    this.applyView();
    this.fireEvent('remove', this, [...removed]);
    this.fireEvent('datachanged', this);
  },
  removeAll() {
    this.allRecords.forEach((r) => {
      r.store = null;
    });
    this.allRecords = [];
    this.records = [];
    this.fireEvent('clear', this);
    this.fireEvent('datachanged', this);
  },

  afterEdit(record, modifiedFields) {
    this.fireEvent('update', this, record, 'edit', modifiedFields);
  },
  afterCommit(record) {
    this.fireEvent('update', this, record, 'commit', []);
  },

  isLoading() {
    return this.loading;
  },

  destroy() {
    if (this.storeId) Ext.data.StoreManager.unregister(this);
    this.clearListeners();
    this.allRecords = [];
    this.records = [];
    this.isDestroyed = true;
  },
});
