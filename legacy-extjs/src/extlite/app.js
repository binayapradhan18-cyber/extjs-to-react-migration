import { Ext } from './core.js';

const SINGLE_PATH = /^\{(!?)([\w.]+)\}$/;
const TOKEN = /\{(!?)([\w.]+)\}/g;

function compileBind(expr) {
  const single = SINGLE_PATH.exec(expr);
  if (single) {
    const [, negate, path] = single;
    return (get) => (negate ? !get(path) : get(path));
  }
  return (get) =>
    expr.replace(TOKEN, (_, negate, path) => {
      const value = get(path);
      return negate ? String(!value) : String(value ?? '');
    });
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clonePlain(v)]));
  }
  return value;
}

Ext.define('Ext.app.ViewModel', {
  alias: 'viewmodel.default',
  isViewModel: true,
  data: null,
  formulas: null,
  stores: null,
  parent: null,
  view: null,

  statics: {
    bindPath(expr) {
      const single = typeof expr === 'string' ? SINGLE_PATH.exec(expr) : null;
      return single && !single[1] ? single[2] : null;
    },
  },

  constructor(config = {}) {
    const { data, ...rest } = config;
    this.callParent([rest]);
    this.data = { ...clonePlain(Object.getPrototypeOf(this).data ?? {}), ...data };
    this.bindings = new Set();
    this.storeMap = {};
    this.storeCleanups = [];
    for (const [name, spec] of Object.entries(this.stores ?? {})) {
      const owned = typeof spec === 'object' && !spec.isStore;
      const store = owned
        ? Ext.create(spec.type ? `store.${spec.type}` : 'Ext.data.Store', spec)
        : Ext.getStore(spec);
      if (!store) throw new Error(`[ExtLite] ViewModel store "${name}" could not be resolved`);
      const onChange = () => this.notify();
      store.on('datachanged', onChange);
      store.on('update', onChange);
      this.storeMap[name] = { store, owned };
      this.storeCleanups.push(() => {
        store.un('datachanged', onChange);
        store.un('update', onChange);
        if (owned) store.destroy();
      });
    }
    this.formulaValues = {};
    this.recalc();
  },

  get(path) {
    const [head, ...rest] = path.split('.');
    let value;
    if (head in this.storeMap) value = this.storeMap[head].store;
    else if (this.formulas && head in this.formulas) value = this.formulaValues[head];
    else if (head in this.data) value = this.data[head];
    else return this.parent ? this.parent.get(path) : undefined;
    for (const key of rest) {
      if (value === null || value === undefined) return undefined;
      if (value.isModel) value = value.get(key);
      else if (value.isStore && key === 'count') value = value.getCount();
      else value = value[key];
    }
    return value;
  },

  set(path, value) {
    if (typeof path === 'object') {
      for (const [key, v] of Object.entries(path)) this.setPath(key, v);
    } else {
      this.setPath(path, value);
    }
    this.notify();
  },

  setPath(path, value) {
    const keys = path.split('.');
    const leaf = keys.pop();
    let target = this.data;
    for (const key of keys) {
      if (target[key] === null || typeof target[key] !== 'object') target[key] = {};
      target = target[key];
    }
    target[leaf] = value;
  },

  recalc() {
    for (const [name, def] of Object.entries(this.formulas ?? {})) {
      const fn = typeof def === 'function' ? def : def.get;
      this.formulaValues[name] = fn.call(this, (p) => this.get(p));
    }
  },

  // Ext batches binding delivery on a scheduler tick; ExtLite delivers synchronously.
  notify() {
    if (this.isDestroyed) return;
    this.recalc();
    for (const binding of [...this.bindings]) binding.deliver();
  },

  bind(expr, callback, scope) {
    const read = compileBind(expr);
    const bindings = this.bindings;
    const vm = this;
    const binding = {
      primed: false,
      last: undefined,
      deliver() {
        const value = read((p) => vm.get(p));
        if (binding.primed && value === binding.last) return;
        binding.primed = true;
        binding.last = value;
        callback.call(scope, value);
      },
      destroy() {
        bindings.delete(binding);
      },
    };
    bindings.add(binding);
    binding.deliver();
    return binding;
  },

  destroy() {
    this.bindings.clear();
    this.storeCleanups.forEach((fn) => fn());
    this.storeCleanups = [];
    this.isDestroyed = true;
  },
});

const controllerSubscriptions = new Set();

function matchesController(controller, selector) {
  if (selector === '*') return true;
  if (selector.startsWith('#')) return controller.id === selector.slice(1);
  return controller.$className === selector;
}

Ext.define('Ext.app.ViewController', {
  mixins: ['Ext.mixin.Observable'],
  alias: 'controller.default',
  isViewController: true,
  view: null,
  listen: null,

  constructor(config = {}) {
    this.id = config.id ?? Ext.id(null, 'controller-');
    this.callParent([config]);
    this.unlisteners = [];
    this.initListeners();
  },

  initView(view) {
    this.view = view;
    this.wireListen();
    this.init(view);
  },
  init() {},

  getView() {
    return this.view;
  },
  getViewModel() {
    return this.view?.lookupViewModel() ?? null;
  },
  getStore(name) {
    const store = this.getViewModel()?.get(name);
    return store?.isStore ? store : Ext.getStore(name);
  },
  lookupReference(reference) {
    return this.view?.lookupReference(reference) ?? null;
  },

  callHandler(handler, args) {
    const fn = typeof handler === 'function' ? handler : this[handler];
    if (typeof fn !== 'function') throw new Error(`[ExtLite] ${this.$className} has no method "${handler}"`);
    return fn.apply(this, args);
  },

  wireListen() {
    const listen = this.listen ?? {};
    for (const [event, handler] of Object.entries(listen.global ?? {})) {
      const fn = (...args) => this.callHandler(handler, args);
      Ext.GlobalEvents.on(event, fn);
      this.unlisteners.push(() => Ext.GlobalEvents.un(event, fn));
    }
    for (const [selector, events] of Object.entries(listen.controller ?? {})) {
      for (const [event, handler] of Object.entries(events)) {
        const sub = { selector, event: event.toLowerCase(), owner: this, fn: (...args) => this.callHandler(handler, args) };
        controllerSubscriptions.add(sub);
        this.unlisteners.push(() => controllerSubscriptions.delete(sub));
      }
    }
    // Component-domain listeners are resolved once at init; Ext keeps them live as components are added.
    for (const [selector, events] of Object.entries(listen.component ?? {})) {
      const targets = [this.view, ...this.view.query('*')].filter((c) => c.is(selector));
      for (const target of targets) {
        for (const [event, handler] of Object.entries(events)) {
          const fn = (...args) => this.callHandler(handler, args);
          target.on(event, fn);
          this.unlisteners.push(() => target.isDestroyed || target.un(event, fn));
        }
      }
    }
  },

  fireEvent(event, ...args) {
    const result = this.mixins.observable.fireEvent.call(this, event, ...args);
    const name = event.toLowerCase();
    for (const sub of [...controllerSubscriptions]) {
      if (sub.owner !== this && sub.event === name && matchesController(this, sub.selector)) sub.fn(...args, this);
    }
    return result;
  },

  destroy() {
    this.unlisteners.forEach((fn) => fn());
    this.unlisteners = [];
    this.clearListeners();
    this.view = null;
    this.isDestroyed = true;
  },
});
