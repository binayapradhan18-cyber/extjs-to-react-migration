export type Unsubscribe = () => void;

export interface BusEvent {
  type: string;
}

export type EventOf<E extends BusEvent, T extends E['type']> = Extract<E, { type: T }>;
export type Handler<E> = (event: E) => void;

export interface EventBus<E extends BusEvent> {
  emit(event: E): void;
  on<T extends E['type']>(type: T, handler: Handler<EventOf<E, T>>): Unsubscribe;
  once<T extends E['type']>(type: T, handler: Handler<EventOf<E, T>>): Unsubscribe;
  onAny(handler: Handler<E>): Unsubscribe;
  listenerCount(type?: E['type']): number;
  clear(): void;
}

export interface EventBusOptions<E extends BusEvent> {
  /** A throwing subscriber must never break delivery to the others (or the legacy caller). */
  onError?: (error: unknown, event: E) => void;
}

export function createEventBus<E extends BusEvent>(options: EventBusOptions<E> = {}): EventBus<E> {
  const byType = new Map<string, Set<Handler<E>>>();
  const wildcard = new Set<Handler<E>>();
  const onError =
    options.onError ??
    ((error: unknown, event: E) => {
      console.error(`[bridge] subscriber for "${event.type}" threw`, error);
    });

  function on<T extends E['type']>(type: T, handler: Handler<EventOf<E, T>>): Unsubscribe {
    let set = byType.get(type);
    if (!set) {
      set = new Set();
      byType.set(type, set);
    }
    const stored = handler as Handler<E>;
    const owner = set;
    owner.add(stored);
    return () => {
      owner.delete(stored);
      if (owner.size === 0 && byType.get(type) === owner) byType.delete(type);
    };
  }

  return {
    on,
    once(type, handler) {
      const off = on(type, (event) => {
        off();
        handler(event);
      });
      return off;
    },
    onAny(handler) {
      wildcard.add(handler);
      return () => {
        wildcard.delete(handler);
      };
    },
    emit(event) {
      const targeted = byType.get(event.type);
      const snapshot = [...(targeted ?? []), ...wildcard];
      for (const handler of snapshot) {
        // Skip handlers removed by an earlier subscriber during this same dispatch.
        if (!targeted?.has(handler) && !wildcard.has(handler)) continue;
        try {
          handler(event);
        } catch (error) {
          onError(error, event);
        }
      }
    },
    listenerCount(type) {
      if (type !== undefined) return byType.get(type)?.size ?? 0;
      let total = wildcard.size;
      byType.forEach((set) => {
        total += set.size;
      });
      return total;
    },
    clear() {
      byType.clear();
      wildcard.clear();
    },
  };
}
