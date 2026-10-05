import { Ext, type ExtModel, type ExtStore } from '@legacy/ext-lite';
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { legacyRecordToTask } from '../src/adapters/task';
import { useExtStore } from '../src/useExtStore';

const rows = [
  { id: 'a', title: 'Excavate', status: 'done', priority: 2, assignee: 'Lee', dueDate: '2026-09-01', estimateHours: 8 },
  { id: 'b', title: 'Formwork', status: 'todo', priority: 3, assignee: null, dueDate: null, estimateHours: 5 },
];

const toTitle = (record: ExtModel) => record.get('title') as string;

function makeStore(): ExtStore {
  return Ext.create<ExtStore>('Ext.data.Store', { model: 'Test.model.Task', data: rows });
}

describe('useExtStore', () => {
  beforeAll(() => {
    Ext.define('Test.model.Task', {
      extend: 'Ext.data.Model',
      fields: [
        'id',
        'title',
        'status',
        { name: 'priority', type: 'int' },
        { name: 'assignee', type: 'string', allowNull: true },
        { name: 'dueDate', type: 'date', dateFormat: 'Y-m-d', allowNull: true },
        { name: 'estimateHours', type: 'float' },
      ],
    });
  });

  let store: ExtStore;
  afterEach(() => store?.destroy());

  it('returns a stable snapshot until the store changes', () => {
    store = makeStore();
    const { result, rerender } = renderHook(() => useExtStore(store, toTitle));
    const first = result.current;
    expect(first).toEqual(['Excavate', 'Formwork']);

    rerender();
    expect(result.current).toBe(first);
  });

  it('re-renders on load, add, sort, filter and in-place record edits', () => {
    store = makeStore();
    const { result } = renderHook(() => useExtStore(store, toTitle));

    act(() => {
      store.add({ id: 'c', title: 'Backfill', status: 'todo', priority: 1, estimateHours: 1 });
    });
    expect(result.current).toEqual(['Excavate', 'Formwork', 'Backfill']);

    act(() => {
      store.sort('title', 'ASC');
    });
    expect(result.current).toEqual(['Backfill', 'Excavate', 'Formwork']);

    act(() => {
      store.filter({ property: 'status', value: 'todo' });
    });
    expect(result.current).toEqual(['Backfill', 'Formwork']);

    act(() => {
      store.getById('b')?.set('title', 'Formwork (revised)');
    });
    expect(result.current).toEqual(['Backfill', 'Formwork (revised)']);

    act(() => {
      store.loadData([{ id: 'z', title: 'Handover', status: 'todo', priority: 2, estimateHours: 0 }]);
    });
    expect(result.current).toEqual(['Handover']);
  });

  it('maps legacy records through the bridge contract (Date -> ISO string)', () => {
    store = makeStore();
    function Summary() {
      const tasks = useExtStore(store, legacyRecordToTask);
      return <output>{tasks.map((t) => `${t?.id}:${t?.dueDate ?? '-'}`).join(',')}</output>;
    }
    render(<Summary />);
    expect(screen.getByRole('status')).toHaveProperty('textContent', 'a:2026-09-01,b:-');
  });

  it('picks up changes made between render and subscription', () => {
    store = makeStore();
    let mutated = false;
    function Probe() {
      const titles = useExtStore(store, toTitle);
      if (!mutated) {
        mutated = true;
        store.getById('a')?.set('title', 'Changed during render phase');
        store.add({ id: 'late', title: 'Late', status: 'todo', priority: 1, estimateHours: 0 });
      }
      return <span data-testid="titles">{titles.join('|')}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('titles').textContent).toContain('Late');
  });

  it('unsubscribes from the store on unmount and tolerates a missing store', () => {
    store = makeStore();
    const { unmount } = renderHook(() => useExtStore(store, toTitle));
    expect(store.hasListener('datachanged')).toBe(true);
    unmount();
    expect(store.hasListener('datachanged')).toBe(false);

    const { result } = renderHook(() => useExtStore(null));
    expect(result.current).toEqual([]);
  });
});
