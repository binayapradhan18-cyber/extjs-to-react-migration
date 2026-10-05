import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import de from '../locales/de.json';
import en from '../locales/en.json';
import { formatIsoDate, isTaskOverdue, legacyRecordToTask, legacyTaskToDTO } from '../src/adapters/task';
import type { Task, TaskSchema } from '../src/contracts/task.generated';
import { createTranslator } from '../src/i18n';

describe('task contract', () => {
  it('generated interface and schema describe the same shape', () => {
    expectTypeOf<z.infer<typeof TaskSchema>>().toEqualTypeOf<Task>();
  });

  it('normalises legacy Date values without timezone drift', () => {
    const late = new Date(2026, 0, 31, 23, 59);
    expect(formatIsoDate(late)).toBe('2026-01-31');
    const dto = legacyTaskToDTO({
      id: 'x',
      title: 'Close out',
      status: 'done',
      priority: 1,
      assignee: undefined,
      dueDate: late,
      estimateHours: 0,
    });
    expect(dto).toMatchObject({ assignee: null, dueDate: '2026-01-31' });
  });

  it('drops invalid records in render paths instead of throwing', () => {
    expect(legacyRecordToTask({ getData: () => ({ id: 'x', title: '' }) })).toBeNull();
  });

  it('matches the legacy isOverdue calculation', () => {
    const today = new Date(2026, 9, 5);
    expect(isTaskOverdue({ dueDate: '2026-10-04', status: 'todo' }, today)).toBe(true);
    expect(isTaskOverdue({ dueDate: '2026-10-05', status: 'todo' }, today)).toBe(false);
    expect(isTaskOverdue({ dueDate: '2026-10-01', status: 'done' }, today)).toBe(false);
    expect(isTaskOverdue({ dueDate: null, status: 'blocked' }, today)).toBe(false);
  });
});

describe('shared i18n catalog', () => {
  it('every locale defines exactly the same keys', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('formats Ext-style positional placeholders and falls back per key', () => {
    const t = createTranslator({ 'a.b': 'Edit: {0} ({1})' }, en);
    expect(t('a.b', 'Slab', 3)).toBe('Edit: Slab (3)');
    expect(t('tasks.title')).toBe('Project Tasks');
    expect(t('missing.key')).toBe('missing.key');
  });
});
