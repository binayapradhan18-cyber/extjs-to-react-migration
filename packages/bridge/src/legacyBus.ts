import type { BusEvent, EventBus, EventOf, Unsubscribe } from './eventBus';

type LegacyListener = (...args: unknown[]) => void;

/** The subset of Ext.util.Observable (e.g. Ext.GlobalEvents) the bridge relies on. */
export interface LegacyObservable {
  on(eventName: string, fn: LegacyListener): unknown;
  un(eventName: string, fn: LegacyListener): unknown;
  fireEvent(eventName: string, ...args: unknown[]): unknown;
}

export type LegacyPayload = readonly [eventName: string, ...args: unknown[]];

export interface LegacyBusMapping<E extends BusEvent> {
  /** legacy event name -> typed event. Return null to drop; throw to report a contract violation. */
  inbound?: Record<string, (...args: unknown[]) => E | null | undefined>;
  /** typed event -> [legacyEventName, ...args]. */
  outbound?: { [T in E['type']]?: (event: EventOf<E, T>) => LegacyPayload | null | undefined };
}

export interface ConnectLegacyBusOptions {
  onContractViolation?: (error: unknown, direction: 'inbound' | 'outbound', eventName: string) => void;
}

/**
 * Bridges Ext's string/positional-argument events to the typed bus in both directions.
 * Events that crossed one way are never echoed back across the same bridge.
 */
export function connectLegacyBus<E extends BusEvent>(
  bus: EventBus<E>,
  legacy: LegacyObservable,
  mapping: LegacyBusMapping<E>,
  options: ConnectLegacyBusOptions = {},
): Unsubscribe {
  const report =
    options.onContractViolation ??
    ((error: unknown, direction: string, eventName: string) => {
      console.warn(`[bridge] dropped ${direction} event "${eventName}"`, error);
    });
  const fromLegacy = new WeakSet<object>();
  const firingLegacy = new Set<string>();
  const cleanups: Unsubscribe[] = [];

  for (const [legacyName, toTyped] of Object.entries(mapping.inbound ?? {})) {
    const listener: LegacyListener = (...args) => {
      if (firingLegacy.has(legacyName.toLowerCase())) return;
      let event: E | null | undefined;
      try {
        event = toTyped(...args);
      } catch (error) {
        report(error, 'inbound', legacyName);
        return;
      }
      if (!event) return;
      fromLegacy.add(event);
      bus.emit(event);
    };
    legacy.on(legacyName, listener);
    cleanups.push(() => {
      legacy.un(legacyName, listener);
    });
  }

  const outbound = (mapping.outbound ?? {}) as Record<string, ((event: E) => LegacyPayload | null | undefined) | undefined>;
  for (const [type, toLegacy] of Object.entries(outbound)) {
    if (!toLegacy) continue;
    cleanups.push(
      bus.on(type as E['type'], (event) => {
        if (fromLegacy.has(event)) return;
        let payload: LegacyPayload | null | undefined;
        try {
          payload = toLegacy(event);
        } catch (error) {
          report(error, 'outbound', type);
          return;
        }
        if (!payload) return;
        const [legacyName, ...args] = payload;
        const key = legacyName.toLowerCase();
        firingLegacy.add(key);
        try {
          legacy.fireEvent(legacyName, ...args);
        } finally {
          firingLegacy.delete(key);
        }
      }),
    );
  }

  return () => {
    cleanups.splice(0).forEach((fn) => fn());
  };
}
