// Deliberately loose typings: the legacy surface is untyped, the bridge narrows it at the boundary.
type Listener = (...args: any[]) => unknown;

export interface ExtObservable {
  on(event: string, fn: Listener, scope?: unknown, options?: { single?: boolean }): this;
  on(events: Record<string, unknown>): this;
  un(event: string, fn: Listener, scope?: unknown): this;
  fireEvent(event: string, ...args: any[]): boolean;
  hasListener(event: string): boolean;
  clearListeners(): void;
}

export interface ExtModel {
  id: string;
  isModel: true;
  store: ExtStore | null;
  get(field: string): any;
  set(field: string | Record<string, unknown>, value?: unknown): string[] | null;
  getId(): string;
  getData(): Record<string, any>;
  isDirty(): boolean;
  commit(): void;
  validate(): { isValid: boolean; errors: Record<string, string> };
}

export interface ExtStore extends ExtObservable {
  isStore: true;
  storeId: string | null;
  load(options?: Record<string, unknown>): Promise<ExtModel[]>;
  loadData(rows: Record<string, unknown>[], append?: boolean): void;
  getCount(): number;
  getTotalCount(): number;
  getAt(index: number): ExtModel | undefined;
  getRange(start?: number, end?: number): ExtModel[];
  getById(id: string): ExtModel | null;
  add(items: Record<string, unknown> | Record<string, unknown>[]): ExtModel[];
  remove(records: ExtModel | ExtModel[]): void;
  removeAll(): void;
  sort(property: string, direction?: 'ASC' | 'DESC'): void;
  filter(property: string | Record<string, unknown>, value?: unknown): void;
  clearFilter(suppressEvent?: boolean): void;
  isLoading(): boolean;
  destroy(): void;
}

export interface ExtComponent extends ExtObservable {
  id: string;
  el: HTMLElement | null;
  rendered: boolean;
  isDestroyed?: boolean;
  ownerCt: ExtComponent | null;
  render(target: HTMLElement | string): this;
  setSize(width?: number | null, height?: number | null): this;
  syncSize(): void;
  destroy(): void;
  query(selector?: string): ExtComponent[];
  down(selector: string): ExtComponent | null;
  [key: string]: any;
}

export interface ExtStatic {
  version: string;
  define(className: string, body: Record<string, any>): any;
  create<T = any>(nameOrAlias: string, config?: Record<string, any>): T;
  widget<T = ExtComponent>(xtype: string | Record<string, any>, config?: Record<string, any>): T;
  getStore(id: string): ExtStore | undefined;
  getCmp(id: string): ExtComponent | null;
  ClassManager: { get(className: string): any; getByAlias(alias: string): any };
  GlobalEvents: ExtObservable;
  WindowManager: { next(): number };
  [key: string]: any;
}

export declare const Ext: ExtStatic;
export default Ext;
