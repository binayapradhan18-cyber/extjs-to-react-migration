import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMockApi, fixtures, renderInWidget } from '../../test/helpers';
import { TasksModule } from './TasksModule';
import { filterTasks, formatDueDate } from './taskMeta';

const dataRows = () => screen.getAllByRole('row').filter((row) => row.getAttribute('aria-selected') !== null);
const titles = () => dataRows().map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('<TasksModule />', () => {
  it('loads tasks and sorts by due date with empty dates last, like the legacy grid', async () => {
    renderInWidget(<TasksModule />);
    expect(await screen.findByText('Pour footing concrete')).toBeInTheDocument();
    expect(titles()).toEqual(['Pour footing concrete', 'Order structural steel', 'Rebar inspection']);
    expect(screen.getByRole('heading', { name: /Project Tasks \(3\)/ })).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('toggles sorting from the column header', async () => {
    const user = userEvent.setup();
    renderInWidget(<TasksModule />);
    await screen.findByText('Pour footing concrete');

    await user.click(screen.getByRole('button', { name: 'Title' }));

    expect(titles()).toEqual(['Order structural steel', 'Pour footing concrete', 'Rebar inspection']);
    expect(screen.getByRole('columnheader', { name: 'Title' })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('filters by status and title, and reacts to the legacy shell search box', async () => {
    const user = userEvent.setup();
    const { host } = renderInWidget(<TasksModule />);
    await screen.findByText('Pour footing concrete');

    await user.selectOptions(screen.getByLabelText('Status'), 'blocked');
    expect(titles()).toEqual(['Rebar inspection']);

    await user.selectOptions(screen.getByLabelText('Status'), 'all');
    act(() => host.bus.emit({ type: 'tasks:search', text: 'steel', source: 'legacy' }));
    expect(titles()).toEqual(['Order structural steel']);
    expect(screen.getByRole('searchbox', { name: 'Search title' })).toHaveValue('steel');
  });

  it('edits the selected task, validates with the shared schema and publishes the save', async () => {
    const user = userEvent.setup();
    const api = createMockApi();
    const { host } = renderInWidget(<TasksModule />, { api });
    const saved = vi.fn();
    const selected = vi.fn();
    host.bus.on('task:saved', saved);
    host.bus.on('task:selected', selected);

    await user.click(await screen.findByText('Order structural steel'));
    expect(selected).toHaveBeenCalledWith({ type: 'task:selected', taskId: 'T-2', source: 'react' });
    const title = screen.getByLabelText('Title');
    expect(title).toHaveValue('Order structural steel');

    await user.clear(title);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This field is required')).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();

    await user.type(title, 'Order structural steel (rev B)');
    await user.selectOptions(screen.getByLabelText('Priority'), '4');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    const expected = { ...fixtures[1], title: 'Order structural steel (rev B)', priority: 4 };
    expect(api.save).toHaveBeenCalledWith(expected);
    expect(saved).toHaveBeenCalledWith({ type: 'task:saved', task: expected, source: 'react' });
    expect(await screen.findByRole('status')).toHaveTextContent('Task saved');
    expect(within(dataRows()[1] as HTMLElement).getByText('Order structural steel (rev B)')).toBeInTheDocument();
  });

  it('applies saves made in the legacy UI to its cache', async () => {
    const { host } = renderInWidget(<TasksModule />);
    await screen.findByText('Rebar inspection');
    const task = { ...fixtures[2], status: 'done' as const, title: 'Rebar inspection (passed)' };

    act(() => host.bus.emit({ type: 'task:saved', task, source: 'legacy' }));

    expect(await screen.findByText('Rebar inspection (passed)')).toBeInTheDocument();
  });

  it('asks before discarding unsaved edits when switching rows', async () => {
    const user = userEvent.setup();
    renderInWidget(<TasksModule />);
    await user.click(await screen.findByText('Order structural steel'));
    await user.type(screen.getByLabelText('Title'), ' draft');

    await user.click(screen.getByText('Rebar inspection'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Order structural steel draft');

    await user.click(screen.getByText('Rebar inspection'));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Rebar inspection'));
  });

  it('shows an error state when the API contract is broken', async () => {
    const api = createMockApi();
    api.list.mockRejectedValueOnce(new Error('500'));
    renderInWidget(<TasksModule />, { api });
    expect(await screen.findByRole('alert')).toHaveTextContent('Tasks could not be loaded.');
  });
});

describe('task helpers', () => {
  it('filters exactly like the legacy store', () => {
    expect(filterTasks(fixtures, 'all', '  STEEL ').map((t) => t.id)).toEqual(['T-2']);
    expect(filterTasks(fixtures, 'blocked', '').map((t) => t.id)).toEqual(['T-3']);
  });

  it('formats dates like Ext.util.Format.date(v, "M j, Y")', () => {
    expect(formatDueDate('2026-10-02')).toBe('Oct 2, 2026');
    expect(formatDueDate(null)).toBe('');
  });
});
