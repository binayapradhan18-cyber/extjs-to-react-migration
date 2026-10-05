import { Ext, type ExtComponent } from '@legacy/ext-lite';
import { act, useEffect } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defineReactWidget, useHostSize } from '../src/defineReactWidget';
import { registerReactHost, type MountFn, type WidgetHandle } from '../src/reactHost';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface GreetingProps {
  name: string;
  onMount?: () => void;
  onUnmount?: () => void;
}

function Greeting({ name, onMount, onUnmount }: GreetingProps) {
  const size = useHostSize();
  useEffect(() => {
    onMount?.();
    return () => onUnmount?.();
  }, [onMount, onUnmount]);
  return (
    <p data-testid="greeting">
      Hello {name}
      {size ? ` @ ${size.width}x${size.height}` : ''}
    </p>
  );
}

const mountGreeting = defineReactWidget(Greeting);

function fakeWidget() {
  const handle: Required<WidgetHandle<unknown>> = { update: vi.fn(), unmount: vi.fn(), resize: vi.fn() };
  const mount = vi.fn<MountFn<unknown>>(() => handle);
  return { mount, handle };
}

describe('Bridge.ReactHost', () => {
  let container: HTMLDivElement;
  let host: ExtComponent | null = null;

  beforeAll(() => {
    registerReactHost(Ext);
    registerReactHost(Ext);
  });

  afterEach(() => {
    act(() => host?.destroy());
    host = null;
    container?.remove();
  });

  function create(config: Record<string, unknown>) {
    container = document.createElement('div');
    document.body.append(container);
    act(() => {
      host = Ext.widget('reacthost', { renderTo: container, ...config });
    });
    return host as unknown as ExtComponent;
  }

  it('mounts a React widget into the component element with config as props', () => {
    const cmp = create({ mount: mountGreeting, props: { name: 'Ext' } });
    expect(cmp.el?.querySelector('[data-testid="greeting"]')?.textContent).toBe('Hello Ext');
    expect(cmp.el?.classList.contains('x-react-host')).toBe(true);
  });

  it('forwards setProps to the widget without remounting', () => {
    const onMount = vi.fn();
    const cmp = create({ mount: mountGreeting, props: { name: 'Ext', onMount } });

    act(() => {
      cmp.setProps({ name: 'React', onMount });
    });

    expect(cmp.el?.textContent).toBe('Hello React');
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('forwards Ext resize to the widget', () => {
    const cmp = create({ mount: mountGreeting, props: { name: 'Ext' } });
    act(() => {
      cmp.setSize(640, 480);
    });
    expect(cmp.el?.textContent).toBe('Hello Ext @ 640x480');
  });

  it('unmounts the React tree on destroy, exactly once, and runs effect cleanups', () => {
    const onUnmount = vi.fn();
    const cmp = create({ mount: mountGreeting, props: { name: 'Ext', onUnmount } });
    const el = cmp.el as HTMLElement;
    const unmounted = vi.fn();
    cmp.on('widgetunmount', unmounted);

    act(() => cmp.destroy());
    act(() => cmp.destroy());

    expect(onUnmount).toHaveBeenCalledTimes(1);
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(el.isConnected).toBe(false);
    expect(el.childNodes).toHaveLength(0);
    expect(Ext.getCmp(cmp.id)).toBeNull();
    host = null;
  });

  it('unmounts when the owning container removes it', () => {
    const { mount, handle } = fakeWidget();
    container = document.createElement('div');
    document.body.append(container);
    const panel = Ext.widget('container', { renderTo: container, items: [{ xtype: 'reacthost', mount, props: { a: 1 } }] });

    expect(mount).toHaveBeenCalledWith(expect.any(HTMLElement), { a: 1 });
    panel.removeAll(true);
    expect(handle.unmount).toHaveBeenCalledTimes(1);
    panel.destroy();
  });

  it('loads lazily and discards a mount that resolves after destroy', async () => {
    const { mount } = fakeWidget();
    let resolveLoad: (fn: MountFn<unknown>) => void = () => undefined;
    const load = () => new Promise<MountFn<unknown>>((resolve) => (resolveLoad = resolve));
    const cmp = create({ load, props: {} });
    expect(cmp.el?.classList.contains('x-react-host-loading')).toBe(true);

    cmp.destroy();
    host = null;
    resolveLoad(mount);
    await Promise.resolve();

    expect(mount).not.toHaveBeenCalled();
  });

  it('renders an error state instead of throwing into the Ext layout', async () => {
    const onError = vi.fn();
    const cmp = create({
      load: () => Promise.reject(new Error('chunk failed')),
      listeners: { widgeterror: onError },
      errorText: 'Unavailable',
    });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(cmp.el?.textContent).toBe('Unavailable');
    expect(cmp.el?.classList.contains('x-react-host-error')).toBe(true);
  });
});
