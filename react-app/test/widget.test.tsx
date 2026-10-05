import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStandaloneHost } from '../src/host/standaloneHost';
import { mountTaskSummaryWidget, mountTasksWidget } from '../src/widget';
import { fixtures } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asRecord = (row: object) => ({ getData: () => ({ ...row }) as Record<string, unknown> });

function fakeLegacyStore(records: readonly object[]) {
  const listeners = new Map<string, Set<() => void>>();
  let data = records.map(asRecord);
  return {
    getRange: () => data,
    on: (event: string, fn: () => void) => listeners.set(event, (listeners.get(event) ?? new Set()).add(fn)),
    un: (event: string, fn: () => void) => listeners.get(event)?.delete(fn),
    replace(next: readonly object[]) {
      data = next.map(asRecord);
      listeners.get('datachanged')?.forEach((fn) => fn());
    },
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

describe('widget bundle entry points', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('mountTasksWidget renders into a host element, injects styles and cleans up on unmount', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: fixtures, total: fixtures.length }))));
    const el = document.createElement('div');
    document.body.append(el);
    const host = createStandaloneHost({ apiBaseUrl: '/app/' });

    let handle!: ReturnType<typeof mountTasksWidget>;
    act(() => {
      handle = mountTasksWidget(el, host);
    });

    expect(await screen.findByText('Pour footing concrete')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/app/api/tasks.json', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer dev-token' }) }));
    expect(document.querySelectorAll('style[data-widget-styles="tasks"]')).toHaveLength(1);

    act(() => handle.update({ ...host, t: (key) => (key === 'tasks.title' ? 'Aufgaben' : host.t(key)) }));
    expect(screen.getByRole('heading', { name: /Aufgaben/ })).toBeInTheDocument();

    act(() => handle.unmount());
    act(() => handle.unmount());
    expect(el).toBeEmptyDOMElement();
    expect(document.querySelector('style[data-widget-styles]')).toBeNull();
  });

  it('mountTaskSummaryWidget reads the legacy Ext store and re-renders when it changes', () => {
    const store = fakeLegacyStore(fixtures);
    const el = document.createElement('div');
    document.body.append(el);
    const host = createStandaloneHost({ legacyStores: { tasks: store } });

    let handle!: ReturnType<typeof mountTaskSummaryWidget>;
    act(() => {
      handle = mountTaskSummaryWidget(el, host);
    });
    const total = () => el.querySelector('[data-card="total"] .rw-card__value')?.textContent;
    expect(total()).toBe('3');

    act(() => store.replace(fixtures.slice(0, 1)));
    expect(total()).toBe('1');

    act(() => handle.unmount());
    expect(store.listenerCount()).toBe(0);
  });
});
