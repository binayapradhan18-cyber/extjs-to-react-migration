import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { BridgeEvent } from '../src/contracts/events';
import { createEventBus } from '../src/eventBus';

const task = {
  id: 't1',
  title: 'Pour slab',
  status: 'todo',
  priority: 2,
  assignee: null,
  dueDate: null,
  estimateHours: 3,
} as const;

describe('createEventBus', () => {
  it('delivers events to subscribers of that type only, narrowed by discriminant', () => {
    const bus = createEventBus<BridgeEvent>();
    const onSaved = vi.fn();
    const onSearch = vi.fn();
    bus.on('task:saved', (event) => {
      expectTypeOf(event.task.title).toEqualTypeOf<string>();
      onSaved(event.task.id);
    });
    bus.on('tasks:search', onSearch);

    bus.emit({ type: 'task:saved', task, source: 'react' });

    expect(onSaved).toHaveBeenCalledWith('t1');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('unsubscribes and cleans up empty channels', () => {
    const bus = createEventBus<BridgeEvent>();
    const handler = vi.fn();
    const off = bus.on('tasks:search', handler);
    expect(bus.listenerCount('tasks:search')).toBe(1);

    off();
    off();
    bus.emit({ type: 'tasks:search', text: 'slab', source: 'legacy' });

    expect(handler).not.toHaveBeenCalled();
    expect(bus.listenerCount()).toBe(0);
  });

  it('supports once and wildcard subscribers', () => {
    const bus = createEventBus<BridgeEvent>();
    const once = vi.fn();
    const any = vi.fn();
    bus.once('nav:navigate', once);
    const offAny = bus.onAny(any);

    bus.emit({ type: 'nav:navigate', module: 'tasks', source: 'legacy' });
    bus.emit({ type: 'nav:navigate', module: 'reports', source: 'legacy' });
    offAny();
    bus.emit({ type: 'nav:navigate', module: 'dashboard', source: 'legacy' });

    expect(once).toHaveBeenCalledTimes(1);
    expect(any).toHaveBeenCalledTimes(2);
  });

  it('isolates a throwing subscriber from the rest', () => {
    const onError = vi.fn();
    const bus = createEventBus<BridgeEvent>({ onError });
    const healthy = vi.fn();
    bus.on('tasks:search', () => {
      throw new Error('boom');
    });
    bus.on('tasks:search', healthy);

    expect(() => bus.emit({ type: 'tasks:search', text: 'x', source: 'react' })).not.toThrow();
    expect(healthy).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ type: 'tasks:search' }));
  });

  it('does not call handlers removed earlier in the same dispatch', () => {
    const bus = createEventBus<BridgeEvent>();
    const second = vi.fn();
    let offSecond: () => void = () => undefined;
    bus.on('tasks:search', () => offSecond());
    offSecond = bus.on('tasks:search', second);

    bus.emit({ type: 'tasks:search', text: 'x', source: 'react' });

    expect(second).not.toHaveBeenCalled();
  });

  it('rejects unknown event shapes at compile time', () => {
    const bus = createEventBus<BridgeEvent>();
    // @ts-expect-error unknown event type
    bus.on('task:deleted', () => undefined);
    // @ts-expect-error missing required payload
    expect(() => bus.emit({ type: 'tasks:search', source: 'react' })).not.toThrow();
  });
});
