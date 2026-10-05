import ts from 'typescript';

const FUNCTION = Symbol('function');
type FunctionMarker = typeof FUNCTION;
type Literal = string | number | boolean | null | RegExp | FunctionMarker | Literal[] | LiteralObject;
interface LiteralObject {
  [key: string]: Literal;
}

export interface ValidatorSpec {
  type: string;
  [option: string]: Literal;
}

export interface FieldSpec {
  name: string;
  type: string;
  allowNull: boolean;
  defaultValue?: Literal;
  dateFormat?: string;
  derived: boolean;
}

export interface ModelSpec {
  className: string;
  typeName: string;
  extend: string;
  fields: FieldSpec[];
  validators: Record<string, ValidatorSpec[]>;
}

export interface ConvertOptions {
  /** Shown in the generated header so readers know where the contract came from. */
  sourceLabel?: string;
  zodImport?: string;
}

export interface ConvertResult {
  models: ModelSpec[];
  code: string;
  warnings: string[];
}

export class CodemodError extends Error {
  constructor(message: string, node?: ts.Node, file?: ts.SourceFile) {
    const where = node && file ? ` (line ${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1})` : '';
    super(`${message}${where}`);
    this.name = 'CodemodError';
  }
}

function propName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function evaluate(node: ts.Expression, file: ts.SourceFile): Literal {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return -Number(node.operand.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isRegularExpressionLiteral(node)) {
    const text = node.text;
    const lastSlash = text.lastIndexOf('/');
    return new RegExp(text.slice(1, lastSlash), text.slice(lastSlash + 1));
  }
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return FUNCTION;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((el) => evaluate(el, file));
  if (ts.isObjectLiteralExpression(node)) {
    const out: LiteralObject = {};
    for (const prop of node.properties) {
      if (ts.isMethodDeclaration(prop)) {
        const key = propName(prop.name);
        if (key) out[key] = FUNCTION;
        continue;
      }
      if (!ts.isPropertyAssignment(prop)) throw new CodemodError('Unsupported object member', prop, file);
      const key = propName(prop.name);
      if (!key) throw new CodemodError('Computed property names are not supported', prop, file);
      out[key] = evaluate(prop.initializer, file);
    }
    return out;
  }
  if (ts.isParenthesizedExpression(node)) return evaluate(node.expression, file);
  throw new CodemodError(`Cannot statically evaluate "${node.getText(file)}"`, node, file);
}

const isObject = (v: Literal | undefined): v is LiteralObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof RegExp);

function toFieldSpec(raw: Literal): FieldSpec {
  if (typeof raw === 'string') return { name: raw, type: 'auto', allowNull: false, derived: false };
  if (!isObject(raw) || typeof raw.name !== 'string') throw new CodemodError('Field definitions need a string "name"');
  const spec: FieldSpec = {
    name: raw.name,
    type: typeof raw.type === 'string' ? raw.type : 'auto',
    allowNull: raw.allowNull === true,
    derived: raw.persist === false || raw.calculate === FUNCTION || raw.convert === FUNCTION,
  };
  if ('defaultValue' in raw) spec.defaultValue = raw.defaultValue;
  if (typeof raw.dateFormat === 'string') spec.dateFormat = raw.dateFormat;
  return spec;
}

function toValidators(raw: Literal | undefined): Record<string, ValidatorSpec[]> {
  if (raw === undefined) return {};
  if (!isObject(raw)) throw new CodemodError('"validators" must be an object keyed by field name');
  const out: Record<string, ValidatorSpec[]> = {};
  for (const [field, value] of Object.entries(raw)) {
    const list: Literal[] = Array.isArray(value) ? value : [value];
    out[field] = list.map((v) => {
      if (typeof v === 'string') return { type: v };
      if (isObject(v) && typeof v.type === 'string') return { ...v, type: v.type };
      throw new CodemodError(`Unsupported validator on "${field}"`);
    });
  }
  return out;
}

export function extractModels(source: string, fileName = 'model.js'): ModelSpec[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const models: ModelSpec[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === 'Ext.define' &&
      node.arguments.length >= 2
    ) {
      const [nameArg, bodyArg] = node.arguments;
      if (nameArg && bodyArg && ts.isStringLiteral(nameArg) && ts.isObjectLiteralExpression(bodyArg)) {
        const body = evaluate(bodyArg, file) as LiteralObject;
        const extend = typeof body.extend === 'string' ? body.extend : 'Ext.Base';
        if (Array.isArray(body.fields)) {
          const className = nameArg.text;
          models.push({
            className,
            typeName: className.split('.').pop() ?? className,
            extend,
            fields: body.fields.map(toFieldSpec),
            validators: toValidators(body.validators),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return models;
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function literalToCode(value: Literal | undefined): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof RegExp) return value.toString();
  if (Array.isArray(value)) return `[${value.map(literalToCode).join(', ')}]`;
  throw new CodemodError('Unsupported default value');
}

interface FieldOutput {
  zod: string;
  ts: string;
}

function convertField(field: FieldSpec, validators: ValidatorSpec[], warnings: string[], model: string): FieldOutput {
  let zod: string;
  let tsType: string;
  switch (field.type) {
    case 'string':
      zod = validators.some((v) => v.type === 'email') ? 'z.email()' : 'z.string()';
      tsType = 'string';
      break;
    case 'int':
      zod = 'z.number().int()';
      tsType = 'number';
      break;
    case 'float':
    case 'number':
      zod = 'z.number()';
      tsType = 'number';
      break;
    case 'bool':
    case 'boolean':
      zod = 'z.boolean()';
      tsType = 'boolean';
      break;
    case 'date':
      // Ext parses dates into Date objects; over the wire (and in React) they stay ISO strings.
      zod = field.dateFormat === 'Y-m-d' ? 'z.iso.date()' : 'z.iso.datetime()';
      tsType = 'string';
      break;
    default:
      zod = 'z.unknown()';
      tsType = 'unknown';
      warnings.push(`${model}.${field.name}: type "${field.type}" mapped to unknown`);
  }

  const chain: string[] = [];
  for (const v of validators) {
    switch (v.type) {
      case 'inclusion': {
        const list = Array.isArray(v.list) ? v.list : [];
        if (list.length && list.every((x) => typeof x === 'string')) {
          zod = `z.enum([${list.map(literalToCode).join(', ')}])`;
          tsType = list.map(literalToCode).join(' | ');
        } else if (list.length && list.every((x) => typeof x === 'number')) {
          zod = `z.union([${list.map((x) => `z.literal(${literalToCode(x)})`).join(', ')}])`;
          tsType = list.map(literalToCode).join(' | ');
        } else {
          warnings.push(`${model}.${field.name}: inclusion list must be all strings or all numbers`);
        }
        break;
      }
      case 'presence':
        if (field.type === 'string') chain.push('.min(1)');
        break;
      case 'length':
        if (typeof v.min === 'number' && !chain.includes('.min(1)')) chain.push(`.min(${v.min})`);
        if (typeof v.max === 'number') chain.push(`.max(${v.max})`);
        break;
      case 'range':
        if (typeof v.min === 'number') chain.push(`.min(${v.min})`);
        if (typeof v.max === 'number') chain.push(`.max(${v.max})`);
        break;
      case 'format':
        if (v.matcher instanceof RegExp) chain.push(`.regex(${v.matcher.toString()})`);
        break;
      case 'email':
        break;
      default:
        warnings.push(`${model}.${field.name}: validator "${v.type}" has no Zod mapping and was skipped`);
    }
  }

  const isEnum = zod.startsWith('z.enum') || zod.startsWith('z.union');
  if (!isEnum) zod += chain.join('');
  if (field.allowNull) {
    zod += '.nullable()';
    tsType += ' | null';
  }
  return { zod, ts: tsType };
}

export function renderModel(model: ModelSpec, warnings: string[]): string {
  if (model.extend !== 'Ext.data.Model') {
    warnings.push(`${model.className} extends ${model.extend}; inherited fields are not included`);
  }
  const persisted = model.fields.filter((f) => !f.derived);
  const derived = model.fields.filter((f) => f.derived);
  const outputs = persisted.map((f) => ({
    field: f,
    ...convertField(f, model.validators[f.name] ?? [], warnings, model.className),
  }));
  const defaults = persisted.filter((f) => f.defaultValue !== undefined);
  const name = model.typeName;

  const lines: string[] = [];
  lines.push(`export const ${name}Schema = z.object({`);
  outputs.forEach((o) => lines.push(`  ${o.field.name}: ${o.zod},`));
  lines.push('});', '');
  lines.push(`export interface ${name} {`);
  outputs.forEach((o) => lines.push(`  ${o.field.name}: ${o.ts};`));
  lines.push('}');
  if (defaults.length) {
    lines.push('', `export const ${name}Defaults = {`);
    defaults.forEach((f) => lines.push(`  ${f.name}: ${literalToCode(f.defaultValue)},`));
    lines.push(`} satisfies Partial<${name}>;`);
  }
  if (derived.length) {
    lines.push('', `/** Derived in Ext (calculate/persist:false), compute in selectors: ${derived.map((f) => f.name).join(', ')} */`);
    lines.push(`export const ${name}DerivedFields = [${derived.map((f) => quote(f.name)).join(', ')}] as const;`);
  }
  return lines.join('\n');
}

export function convertExtModels(source: string, options: ConvertOptions = {}): ConvertResult {
  const models = extractModels(source);
  if (!models.length) throw new CodemodError('No Ext.define(...) model with a "fields" array was found');
  const warnings: string[] = [];
  const bodies = models.map((m) => renderModel(m, warnings));
  const from = options.sourceLabel ?? models.map((m) => m.className).join(', ');
  const header = [
    `// Generated from ${from} by codemods/src/extModelToZod.ts. Do not edit by hand.`,
    '// Regenerate with: npm run codegen',
    `import { z } from '${options.zodImport ?? 'zod'}';`,
  ];
  return { models, code: `${header.join('\n')}\n\n${bodies.join('\n\n')}\n`, warnings };
}
