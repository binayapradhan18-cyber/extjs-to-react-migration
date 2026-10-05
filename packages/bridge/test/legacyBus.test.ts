import { Ext, type ExtObservable } from '@legacy/ext-lite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyTaskToDTO } from '../src/adapters/task';
import type { BridgeEvent } from '../src/contracts/events';
import { createEventBus, type EventBus } from '../src/eventBus';
import { connectLegacyBus, type LegacyBusMapping } from '../src/legacyBus';

const mapping: LegacyBusMapping<BridgeEvent> = {
  inbound: {
    tasksaved: (data) => ({ type: 'task:saved', task: legacyTaskToDTO(data as Record<string, unknown>), source: 'legacy' }),
    shellsearch: (text) => ({ type: 'tasks:search', text: String(text ?? ''), source: 'legacy' }),
  },
  outbound: {
    'task:saved': (event) => ['tasksaved', event.task],
    'tasks:search': (event) => ['shellsearch', event.text],
  },
};

const legacyTask = {
  id: 't7',
  title: 'Inspect rebar',
  status: 'in_progress',
  priority: 3,
  assignee: 'Ana',
  dueDate: new Date(2026, 9, 12),
  estimateHours: 2,
  isOverdue: false,
};

describe('connectLegacyBus', () => {
  let legacy: ExtObservable;
  let bus: EventBus<BridgeEvent>;

  beforeEach(() => {
    legacy = Ext.create<ExtObservable>('Ext.util.GlobalEvents');
    bus = createEventBus<BridgeEvent>();
  });

  afterEach(() => {
    bus.clear();
  });

  it('maps legacy fireEvent calls to validated typed events', () => {
    connectLegacyBus(bus, legacy, mapping);
    const handler = vi.fn();
    bus.on('task:saved', handler);

    legacy.fireEvent('tasksaved', legacyTask);

    expect(handler).toHaveBeenCalledWith({
      type: 'task:saved',
      source: 'legacy',
      task: { id: 't7', title: 'Inspect rebar', status: 'in_progress', priority: 3, assignee: 'Ana', dueDate: '2026-10-12', estimateHours: 2 },
    });
  });

  it('maps typed events to legacy events with positional args', () => {
    connectLegacyBus(bus, legacy, mapping);
    const listener = vi.fn();
    legacy.on('shellsearch', listener);

    bus.emit({ type: 'tasks:search', text: 'rebar', source: 'react' });

    expect(listener).toHaveBeenCalledWith('rebar');
  });

  it('never echoes an event back across the bridge', () => {
    connectLegacyBus(bus, legacy, mapping);
    const typed = vi.fn();
    const legacyListener = vi.fn();
    bus.on('tasks:search', typed);
    legacy.on('shellsearch', legacyListener);

    legacy.fireEvent('shellsearch', 'from-ext');
    bus.emit({ type: 'tasks:search', text: 'from-react', source: 'react' });

    expect(typed.mock.calls.map(([e]) => e.text)).toEqual(['from-ext', 'from-react']);
    expect(legacyListener.mock.calls.map(([text]) => text)).toEqual(['from-ext', 'from-react']);
  });

  it('reports and drops payloads that violate the contract', () => {
    const onContractViolation = vi.fn();
    connectLegacyBus(bus, legacy, mapping, { onContractViolation });
    const handler = vi.fn();
    bus.on('task:saved', handler);

    legacy.fireEvent('tasksaved', { ...legacyTask, status: 'archived' });

    expect(handler).not.toHaveBeenCalled();
    expect(onContractViolation).toHaveBeenCalledWith(expect.anything(), 'inbound', 'tasksaved');
  });

  it('disconnect removes listeners on both sides', () => {
    const disconnect = connectLegacyBus(bus, legacy, mapping);
    expect(legacy.hasListener('tasksaved')).toBe(true);
    expect(bus.listenerCount()).toBe(2);

    disconnect();

    expect(legacy.hasListener('tasksaved')).toBe(false);
    expect(bus.listenerCount()).toBe(0);
  });
});
