import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { convertExtModels } from './extModelToZod.ts';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node src/cli.ts <ext-model.js> <out.ts>');
  process.exit(1);
}

const source = readFileSync(input, 'utf8');
const sourceLabel = path.relative(process.cwd(), input).split(path.sep).join('/');
const { code, warnings, models } = convertExtModels(source, { sourceLabel: path.basename(sourceLabel) });
writeFileSync(output, code);

warnings.forEach((w) => console.warn(`warning: ${w}`));
console.log(`Converted ${models.map((m) => m.className).join(', ')} -> ${output}`);
