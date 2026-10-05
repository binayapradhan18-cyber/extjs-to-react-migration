import { useMemo, useSyncExternalStore } from 'react';
import type { ExtStoreLike, StoreListener } from './contracts/hostContext';

const STORE_EVENTS = ['datachanged', 'refresh', 'update', 'load', 'add', 'remove', 'clear'] as const;
const EMPTY: readonly never[] = Object.freeze([]);
const noopSubscribe = () => () => undefined;
const emptySnapshot = () => EMPTY;

export interface ExtStoreSource<T> {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): readonly T[];
}

/**
 * Exposes a mutable Ext store as an immutable snapshot for useSyncExternalStore.
 * Ext records mutate in place, so the snapshot (and every mapped item) is rebuilt on change.
 */
export function createExtStoreSource<R, T>(store: ExtStoreLike<R>, map: (record: R) => T): ExtStoreSource<T> {
  let raw: R[] = [];
  let snapshot: readonly T[] = EMPTY;
  let dirty = true;

  return {
    subscribe(onChange) {
      const handler: StoreListener = () => {
        dirty = true;
        onChange();
      };
      STORE_EVENTS.forEach((event) => store.on(event, handler));
      // The store may have changed between React's render and this subscription.
      const current = store.getRange();
      if (current.length !== raw.length || current.some((record, i) => record !== raw[i])) dirty = true;
      return () => {
        STORE_EVENTS.forEach((event) => store.un(event, handler));
      };
    },
    getSnapshot() {
      if (dirty) {
        raw = store.getRange();
        snapshot = Object.freeze(raw.map(map));
        dirty = false;
      }
      return snapshot;
    },
  };
}

/**
 * Read a legacy Ext store from React during the coexistence period.
 * `map` must be referentially stable (module-level or memoised), otherwise the source is rebuilt each render.
 */
export function useExtStore<R>(store: ExtStoreLike<R> | null | undefined): readonly R[];
export function useExtStore<R, T>(store: ExtStoreLike<R> | null | undefined, map: (record: R) => T): readonly T[];
export function useExtStore<R, T>(
  store: ExtStoreLike<R> | null | undefined,
  map?: (record: R) => T,
): readonly (R | T)[] {
  const source = useMemo(
    () => (store ? createExtStoreSource<R, R | T>(store, map ?? ((record) => record)) : null),
    [store, map],
  );
  const getSnapshot = source ? source.getSnapshot : emptySnapshot;
  return useSyncExternalStore(source ? source.subscribe : noopSubscribe, getSnapshot, getSnapshot);
}
