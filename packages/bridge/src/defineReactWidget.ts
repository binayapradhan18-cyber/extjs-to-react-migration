import { createContext, createElement, StrictMode, useContext, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { MountFn, WidgetSize } from './reactHost';

const HostSizeContext = createContext<WidgetSize | null>(null);

/** Size last reported by the Ext layout (null until the first resize). */
export function useHostSize(): WidgetSize | null {
  return useContext(HostSizeContext);
}

export interface DefineWidgetOptions {
  strict?: boolean;
}

/** Adapts a React component to the framework-agnostic MountFn contract used by Bridge.ReactHost. */
export function defineReactWidget<P extends object>(
  Component: ComponentType<P>,
  options: DefineWidgetOptions = {},
): MountFn<P> {
  return (el, initialProps) => {
    const root = createRoot(el);
    let props = initialProps;
    let size: WidgetSize | null = null;
    let mounted = true;

    const render = () => {
      const tree = createElement(HostSizeContext.Provider, { value: size }, createElement(Component, props));
      root.render(options.strict ? createElement(StrictMode, null, tree) : tree);
    };
    render();

    return {
      update(next) {
        if (!mounted) return;
        props = next;
        render();
      },
      resize(next) {
        if (!mounted || (size && size.width === next.width && size.height === next.height)) return;
        size = next;
        render();
      },
      unmount() {
        if (!mounted) return;
        mounted = false;
        root.unmount();
      },
    };
  };
}
