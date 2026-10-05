// ExtLite core: class system, observable mixin, global event bus and small utilities.
const classes = new Map();
const aliases = new Map();
const RESERVED = new Set(['extend', 'config', 'mixins', 'statics', 'alias', 'xtype', 'singleton']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let idSeed = 0;

export const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const usesCallParent = (fn) => /\bcallParent\b/.test(Function.prototype.toString.call(fn));

// Ext resolves callParent through the caller chain; strict-mode ES modules forbid that,
// so overriding methods that mention callParent are wrapped with a scoped trampoline.
function wrapCallParent(fn, parentFn) {
  return function (...args) {
    const saved = this.callParent;
    this.callParent = (parentArgs) =>
      parentFn ? parentFn.apply(this, parentArgs ? Array.from(parentArgs) : []) : undefined;
    try {
      return fn.apply(this, args);
    } finally {
      this.callParent = saved;
    }
  };
}

class Base {
  constructor(...args) {
    this.$construct(...args);
  }
}
Object.assign(Base.prototype, {
  $className: 'Ext.Base',
  $configDefaults: {},
  $xtypes: [],
  mixins: {},
  $construct(config) {
    this.initConfig(config);
  },
  initConfig(config = {}) {
    this.$config = this.$config ?? {};
    const defaults = this.$configDefaults;
    const merged = { ...defaults, ...config };
    for (const key of Object.keys(merged)) {
      if (!hasOwn(defaults, key)) this[key] = merged[key];
    }
    for (const key of Object.keys(defaults)) this[`set${capitalize(key)}`](merged[key]);
    return this;
  },
  destroy() {
    this.isDestroyed = true;
  },
});

function defineConfigAccessors(proto, key) {
  const cap = capitalize(key);
  if (!hasOwn(proto, `get${cap}`)) {
    proto[`get${cap}`] = function () {
      return this.$config?.[key];
    };
  }
  if (!hasOwn(proto, `set${cap}`)) {
    proto[`set${cap}`] = function (value) {
      const config = this.$config ?? (this.$config = {});
      const old = config[key];
      const apply = this[`apply${cap}`];
      if (typeof apply === 'function') {
        value = apply.call(this, value, old);
        if (value === undefined) return this;
      }
      config[key] = value;
      const update = this[`update${cap}`];
      if (value !== old && typeof update === 'function') update.call(this, value, old);
      return this;
    };
  }
}

function resolveClass(ref) {
  return typeof ref === 'function' ? ref : classes.get(ref);
}

function normalizeMixins(mixins) {
  if (!mixins) return {};
  if (!Array.isArray(mixins)) return Object.fromEntries(Object.entries(mixins).map(([id, ref]) => [id, resolveClass(ref)]));
  return Object.fromEntries(
    mixins.map((ref) => {
      const Cls = resolveClass(ref);
      const last = Cls.prototype.$className.split('.').pop();
      return [last.charAt(0).toLowerCase() + last.slice(1), Cls];
    }),
  );
}

function applyMixin(proto, id, Mixin) {
  const mp = Mixin.prototype;
  for (const key of Object.getOwnPropertyNames(mp)) {
    if (key === 'constructor' || key.startsWith('$') || key in proto) continue;
    proto[key] = mp[key];
  }
  for (const key of Object.keys(mp.$configDefaults)) {
    if (!hasOwn(proto.$configDefaults, key)) proto.$configDefaults[key] = mp.$configDefaults[key];
    defineConfigAccessors(proto, key);
  }
  proto.mixins[id] = mp;
}

function exportToNamespace(name, value) {
  const parts = name.split('.');
  const leaf = parts.pop();
  let target = globalThis;
  for (const part of parts) {
    target = target === globalThis && part === 'Ext' ? Ext : (target[part] ??= {});
  }
  target[leaf] = value;
}

function define(name, body = {}) {
  const Parent = resolveClass(body.extend ?? 'Ext.Base');
  if (!Parent) throw new Error(`[ExtLite] ${name}: unknown parent class "${body.extend}"`);

  const Cls = class extends Parent {};
  Object.defineProperty(Cls, 'name', { value: name.split('.').pop() });
  Cls.superclass = Parent.prototype;
  const proto = Cls.prototype;
  proto.$className = name;
  proto.$configDefaults = { ...Parent.prototype.$configDefaults };
  proto.mixins = { ...Parent.prototype.mixins };

  for (const [id, Mixin] of Object.entries(normalizeMixins(body.mixins))) applyMixin(proto, id, Mixin);

  if (body.config) {
    Object.assign(proto.$configDefaults, body.config);
    Object.keys(body.config).forEach((key) => defineConfigAccessors(proto, key));
  }

  for (const [key, value] of Object.entries(body)) {
    if (RESERVED.has(key)) continue;
    const member = key === 'constructor' ? '$construct' : key;
    proto[member] = typeof value === 'function' && usesCallParent(value) ? wrapCallParent(value, proto[member]) : value;
  }

  if (body.statics) Object.assign(Cls, body.statics);

  const ownAliases = [].concat(body.alias ?? [], body.xtype ? `widget.${body.xtype}` : []);
  const xtypes = ownAliases.filter((a) => a.startsWith('widget.')).map((a) => a.slice('widget.'.length));
  proto.$xtypes = [...Parent.prototype.$xtypes, ...xtypes];
  if (xtypes.length) proto.xtype = xtypes[0];
  ownAliases.forEach((alias) => aliases.set(alias, Cls));

  classes.set(name, Cls);
  exportToNamespace(name, body.singleton ? new Cls() : Cls);
  return Cls;
}

export const Ext = {
  version: 'lite-1.0',
  define,
  ClassManager: {
    get: (name) => classes.get(name) ?? null,
    getByAlias: (alias) => aliases.get(alias) ?? null,
  },
  create(nameOrAlias, config) {
    const Cls = classes.get(nameOrAlias) ?? aliases.get(nameOrAlias);
    if (!Cls) throw new Error(`[ExtLite] Unknown class or alias "${nameOrAlias}"`);
    return new Cls(config);
  },
  createByAlias(prefix, spec, defaultType = 'default') {
    if (!spec) return null;
    if (spec.$className) return spec;
    const config = typeof spec === 'string' ? { type: spec } : spec;
    return Ext.create(`${prefix}.${config.type ?? defaultType}`, config);
  },
  widget(xtype, config = {}) {
    if (typeof xtype === 'object') {
      config = xtype;
      xtype = config.xtype;
    }
    return Ext.create(`widget.${xtype}`, config);
  },
  id(_el, prefix = 'ext-') {
    idSeed += 1;
    return `${prefix}${idSeed}`;
  },
  String: {
    htmlEncode: (value) =>
      String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  },
  Date: {
    parse(value, format = 'Y-m-d') {
      if (format === 'Y-m-d') {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
      }
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    },
    format(date, format = 'Y-m-d') {
      if (!(date instanceof Date)) return '';
      const pad = (n) => String(n).padStart(2, '0');
      const tokens = {
        Y: date.getFullYear(),
        m: pad(date.getMonth() + 1),
        n: date.getMonth() + 1,
        d: pad(date.getDate()),
        j: date.getDate(),
        M: MONTHS[date.getMonth()],
      };
      return format.replace(/[YmndjM]/g, (t) => tokens[t]);
    },
    today() {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    },
  },
  WindowManager: {
    zseed: 19000,
    next() {
      this.zseed += 10;
      return this.zseed;
    },
  },
};

Ext.util = {
  Format: {
    date: (value, format) => Ext.Date.format(value, format),
    htmlEncode: (value) => Ext.String.htmlEncode(value),
  },
};

classes.set('Ext.Base', Base);
Ext.Base = Base;

define('Ext.mixin.Observable', {
  initListeners() {
    if (this.listeners) {
      const listeners = this.listeners;
      this.listeners = null;
      this.on(listeners);
    }
  },
  on(event, fn, scope, options) {
    if (event && typeof event === 'object') {
      const { scope: sharedScope, ...events } = event;
      for (const [name, handler] of Object.entries(events)) this.on(name, handler, sharedScope);
      return this;
    }
    const map = this.$listeners ?? (this.$listeners = Object.create(null));
    const key = event.toLowerCase();
    (map[key] ??= []).push({ fn, scope, single: Boolean(options?.single) });
    return options?.destroyable ? { destroy: () => this.un(event, fn, scope) } : this;
  },
  un(event, fn, scope) {
    const list = this.$listeners?.[event.toLowerCase()];
    if (!list) return this;
    const index = list.findIndex((l) => l.fn === fn && (scope === undefined || l.scope === scope));
    if (index > -1) list.splice(index, 1);
    return this;
  },
  fireEvent(event, ...args) {
    if (this.eventsSuspended) return true;
    const list = this.$listeners?.[event.toLowerCase()];
    if (!list?.length) return true;
    for (const listener of list.slice()) {
      if (listener.single) this.un(event, listener.fn, listener.scope);
      const { fn, scope } =
        typeof listener.fn === 'string' ? this.resolveHandler(listener.fn, listener.scope) : listener;
      if (fn.apply(scope ?? this, args) === false) return false;
    }
    return true;
  },
  resolveHandler(name, scope) {
    const target = scope ?? this;
    if (typeof target[name] !== 'function') throw new Error(`[ExtLite] No handler "${name}" on ${target.$className}`);
    return { fn: target[name], scope: target };
  },
  hasListener(event) {
    return Boolean(this.$listeners?.[event.toLowerCase()]?.length);
  },
  clearListeners() {
    this.$listeners = null;
  },
  suspendEvents() {
    this.eventsSuspended = true;
  },
  resumeEvents() {
    this.eventsSuspended = false;
  },
});

define('Ext.util.GlobalEvents', { mixins: ['Ext.mixin.Observable'] });
Ext.GlobalEvents = Ext.create('Ext.util.GlobalEvents');

Ext.Ajax = {
  defaultHeaders: {},
  async request({ url, method = 'GET', params, jsonData, headers }) {
    let target = url;
    if (params && method === 'GET') target += (url.includes('?') ? '&' : '?') + new URLSearchParams(params);
    const init = { method, headers: { ...this.defaultHeaders, ...headers } };
    if (jsonData !== undefined) {
      init.body = JSON.stringify(jsonData);
      init.headers['Content-Type'] = 'application/json';
    }
    let response;
    let ok = false;
    try {
      const res = await fetch(target, init);
      response = { status: res.status, responseText: await res.text() };
      ok = res.ok;
    } catch (error) {
      response = { status: 0, responseText: '', error };
    }
    if (!ok) throw Object.assign(new Error(`[ExtLite] ${method} ${url} failed (${response.status})`), { response });
    return response;
  },
};


Ext.toast = (message, timeout = 2500) => {
  const el = document.createElement('div');
  el.className = 'x-toast';
  el.setAttribute('role', 'status');
  el.style.zIndex = String(Ext.WindowManager.next());
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), timeout);
  return el;
};
