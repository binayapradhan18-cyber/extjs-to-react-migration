export interface WidgetSize {
  width: number;
  height: number;
}

/** Framework-agnostic widget contract: the Ext side never imports React. */
export interface WidgetHandle<P> {
  update(props: P): void;
  unmount(): void;
  resize?(size: WidgetSize): void;
}

export type MountFn<P> = (el: HTMLElement, props: P) => WidgetHandle<P>;
export type MountLoader<P> = () => Promise<MountFn<P>>;

/** Minimal slice of the Ext class system needed to register the host component. */
export interface ExtLike {
  define(className: string, body: object): unknown;
  ClassManager: { get(className: string): unknown };
}

export interface ReactHostConfig<P> {
  /** Synchronous mount function (widget bundle already loaded). */
  mount?: MountFn<P>;
  /** Lazy loader, e.g. `() => import('tasks-widget').then(m => m.mountTasksWidget)`. */
  load?: MountLoader<P>;
  props?: P;
  /** Watch the element with ResizeObserver for flex layouts Ext does not size explicitly. */
  observeResize?: boolean;
  errorText?: string;
}

interface ReactHostInstance {
  el: HTMLElement | null;
  isDestroyed?: boolean;
  mount: MountFn<unknown> | null;
  load: MountLoader<unknown> | null;
  observeResize: boolean;
  errorText: string;
  handle: WidgetHandle<unknown> | null;
  mountToken: number;
  resizeObserver: ResizeObserver | null;
  lastWidth?: number;
  lastHeight?: number;
  getProps(): unknown;
  callParent(args?: unknown[]): unknown;
  fireEvent(eventName: string, ...args: unknown[]): boolean;
  syncSize(): void;
  mountWidget(): void;
  attachWidget(mount: MountFn<unknown>): void;
  showError(error: unknown): void;
}

export const REACT_HOST_CLASS = 'Bridge.ReactHost';
export const REACT_HOST_XTYPE = 'reacthost';

/**
 * Registers `Bridge.ReactHost` (xtype `reacthost`): an Ext component whose element is a React root.
 * Config flows in as props, Ext resize/destroy are forwarded, and late async loads are discarded.
 */
export function registerReactHost(Ext: ExtLike): void {
  if (Ext.ClassManager.get(REACT_HOST_CLASS)) return;

  Ext.define(REACT_HOST_CLASS, {
    extend: 'Ext.Component',
    alias: `widget.${REACT_HOST_XTYPE}`,
    config: { props: null },
    baseCls: 'x-component x-react-host',
    mount: null,
    load: null,
    observeResize: false,
    errorText: 'This view failed to load.',
    handle: null,
    mountToken: 0,
    resizeObserver: null,

    afterRender(this: ReactHostInstance) {
      this.callParent();
      this.mountWidget();
    },

    mountWidget(this: ReactHostInstance) {
      this.mountToken += 1;
      const token = this.mountToken;
      if (this.mount) {
        this.attachWidget(this.mount);
        return;
      }
      if (!this.load) {
        this.showError(new Error(`${REACT_HOST_CLASS} needs a "mount" or "load" config`));
        return;
      }
      this.el?.classList.add('x-react-host-loading');
      this.load().then(
        (mount) => {
          if (token !== this.mountToken || this.isDestroyed) return;
          this.el?.classList.remove('x-react-host-loading');
          this.attachWidget(mount);
        },
        (error: unknown) => {
          if (token !== this.mountToken || this.isDestroyed) return;
          this.el?.classList.remove('x-react-host-loading');
          this.showError(error);
        },
      );
    },

    attachWidget(this: ReactHostInstance, mount: MountFn<unknown>) {
      if (!this.el) return;
      try {
        this.handle = mount(this.el, this.getProps());
      } catch (error) {
        this.showError(error);
        return;
      }
      if (this.lastWidth !== undefined && this.lastHeight !== undefined) {
        this.handle.resize?.({ width: this.lastWidth, height: this.lastHeight });
      }
      if (this.observeResize && typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.syncSize());
        this.resizeObserver.observe(this.el);
      }
      this.fireEvent('widgetmount', this);
    },

    showError(this: ReactHostInstance, error: unknown) {
      if (this.el) {
        this.el.classList.add('x-react-host-error');
        this.el.textContent = this.errorText;
      }
      this.fireEvent('widgeterror', this, error);
    },

    updateProps(this: ReactHostInstance, props: unknown) {
      this.handle?.update(props);
    },

    onResize(this: ReactHostInstance, width: number, height: number) {
      this.callParent([width, height]);
      this.handle?.resize?.({ width, height });
    },

    onDestroy(this: ReactHostInstance) {
      this.mountToken += 1;
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      const handle = this.handle;
      this.handle = null;
      if (handle) {
        try {
          handle.unmount();
        } catch (error) {
          console.error(`[bridge] ${REACT_HOST_CLASS} unmount failed`, error);
        }
        this.fireEvent('widgetunmount', this);
      }
      this.callParent();
    },
  });
}
