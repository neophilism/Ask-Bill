/** Export a fully local, explicitly non-authoritative Ask Bill reader demonstration. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPreview } from '../apps/web/preview/reader.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const requested = process.argv[2] ?? 'dist/offline-preview';
if (requested === '--help') {
  console.log('Usage: node scripts/export-offline-preview.mjs [dist/<folder>]');
  process.exit(0);
}
const base = resolve(root, 'dist');
const target = resolve(root, requested);
if (!target.startsWith(base + sep) || target === base) {
  throw Error('Exports must be placed in a named subdirectory of dist/');
}
const fixture = JSON.parse(await readFile(new URL('../fixtures/electronic-filing-excerpt.json', import.meta.url), 'utf8'));
const page = renderPreview(fixture)
  .replace('href="/preview.css"', 'href="./preview.css"')
  .replace('src="/preview.js"', 'src="./preview.js"');
if (page.includes('src="/preview.js"') || page.includes('href="/preview.css"')) {
  throw Error('Preview assets were not converted into local paths');
}
await mkdir(target, { recursive: true });
await writeFile(resolve(target, 'index.html'), page);
for (const filename of ['preview.js', 'preview.css']) {
  const content = await readFile(new URL(`../apps/web/preview/${filename}`, import.meta.url));
  await writeFile(resolve(target, filename), content);
}
await writeFile(resolve(target, 'README.txt'), [
  'Ask Bill: offline reader demonstration',
  '',
  'Open index.html in a modern web browser. No server or account is needed.',
  'This package is a demonstration with an incomplete, nonpublishable draft excerpt.',
  'Its three answers are prewritten and limited to the excerpt; no live AI or legal advice.',
  'The friendly illustration is a placeholder, not the finished 3D character.',
  'No microphone, analytics, or personal questions are transmitted.',
  'Source: neophilism/Ask-Bill; developed independently of other products.',
  ''
].join('\n'));
console.log(`Ask Bill offline preview exported: ${relative(root, target)}`);
