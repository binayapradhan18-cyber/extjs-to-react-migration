import { useEffect, useRef } from 'react';
import type { BusEvent, EventBus, EventOf } from './eventBus';

/** Subscribes for the component's lifetime; the latest handler is always called without resubscribing. */
export function useBusEvent<E extends BusEvent, T extends E['type']>(
  bus: EventBus<E> | null | undefined,
  type: T,
  handler: (event: EventOf<E, T>) => void,
): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => (bus ? bus.on(type, (event) => handlerRef.current(event)) : undefined), [bus, type]);
}
