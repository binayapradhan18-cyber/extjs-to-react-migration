import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CodemodError, convertExtModels, extractModels } from '../src/extModelToZod.ts';

const legacyTaskModel = new URL('../../legacy-extjs/src/app/model/Task.js', import.meta.url);
const generatedContract = new URL('../../packages/bridge/src/contracts/task.generated.ts', import.meta.url);

const SIMPLE = `
Ext.define('Crm.model.Contact', {
  extend: 'Ext.data.Model',
  fields: [
    'id',
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string', allowNull: true },
    { name: 'age', type: 'int', defaultValue: 0 },
    { name: 'vip', type: 'boolean' },
    { name: 'tier', type: 'int' },
    { name: 'fullLabel', calculate: function (d) { return d.name; } }
  ],
  validators: {
    name: 'presence',
    email: { type: 'email' },
    age: { type: 'range', min: 0, max: 130 },
    tier: { type: 'inclusion', list: [1, 2, 3] },
    vip: { type: 'customRule' }
  }
});
`;

describe('extModelToZod codemod', () => {
  it('extracts fields and validators from an Ext.define model', () => {
    const [model] = extractModels(SIMPLE);
    expect(model?.className).toBe('Crm.model.Contact');
    expect(model?.typeName).toBe('Contact');
    expect(model?.fields.map((f) => f.name)).toEqual(['id', 'name', 'email', 'age', 'vip', 'tier', 'fullLabel']);
    expect(model?.fields.find((f) => f.name === 'fullLabel')?.derived).toBe(true);
    expect(model?.validators.name).toEqual([{ type: 'presence' }]);
  });

  it('emits a Zod schema, an interface, defaults and derived-field metadata', () => {
    const { code, warnings } = convertExtModels(SIMPLE);
    expect(code).toContain("import { z } from 'zod';");
    expect(code).toContain('  name: z.string().min(1),');
    expect(code).toContain('  email: z.email().nullable(),');
    expect(code).toContain('  age: z.number().int().min(0).max(130),');
    expect(code).toContain('  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),');
    expect(code).toContain('  id: unknown;');
    expect(code).toContain('  email: string | null;');
    expect(code).toContain('  tier: 1 | 2 | 3;');
    expect(code).toContain('export const ContactDefaults = {\n  age: 0,\n} satisfies Partial<Contact>;');
    expect(code).toContain("export const ContactDerivedFields = ['fullLabel'] as const;");
    expect(code).not.toMatch(/fullLabel: /);
    expect(warnings).toEqual([
      'Crm.model.Contact.id: type "auto" mapped to unknown',
      'Crm.model.Contact.vip: validator "customRule" has no Zod mapping and was skipped',
    ]);
  });

  it('produces a schema that validates like the Ext model', () => {
    const { code } = convertExtModels(readFileSync(legacyTaskModel, 'utf8'));
    const js = code
      .replace(/^import .*$/m, '')
      .replace(/export interface [\s\S]*?\n}\n/, '')
      .replace(/ satisfies Partial<\w+>/, '')
      .replace(/ as const/, '')
      .replace(/export const/g, 'const');
    const TaskSchema = new Function('z', `${js}\nreturn TaskSchema;`)(z) as z.ZodType;
    const valid = { id: 't1', title: 'Pour slab', status: 'todo', priority: 2, assignee: null, dueDate: '2026-10-12', estimateHours: 4 };
    expect(TaskSchema.safeParse(valid).success).toBe(true);
    expect(TaskSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...valid, status: 'archived' }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...valid, priority: 9 }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...valid, dueDate: '12/10/2026' }).success).toBe(false);
  });

  it('keeps the checked-in bridge contract in sync with the legacy model (drift guard)', () => {
    const { code } = convertExtModels(readFileSync(legacyTaskModel, 'utf8'), { sourceLabel: 'Task.js' });
    expect(readFileSync(generatedContract, 'utf8').replace(/\r\n/g, '\n')).toBe(code);
  });

  it('fails loudly on non-literal model bodies', () => {
    const dynamic = "Ext.define('A.B', { extend: 'Ext.data.Model', fields: buildFields() });";
    expect(() => extractModels(dynamic)).toThrow(CodemodError);
    expect(() => convertExtModels("Ext.define('A.View', { extend: 'Ext.panel.Panel' });")).toThrow(/No Ext.define/);
  });
});
