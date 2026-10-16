import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
let count = 0;
async function walk(dir) {
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '.next', 'coverage'].includes(entry.name)) await walk(file);
      continue;
    }
    if (!/\.(?:ts|mjs|js)$/.test(entry.name)) continue;
    const source = await readFile(join(root, file), 'utf8');
    if (source.includes('\r') || source.split('\n').some(line => /[ \t]+$/.test(line))) {
      throw new Error('Trailing whitespace or non-LF source: ' + relative(root, join(root, file)));
    }
    if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(source)) {
      throw new Error('Dynamic code execution forbidden: ' + file);
    }
    if (/\.(?:mjs|js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
      if (result.error || result.status !== 0) {
        throw new Error('Invalid JS syntax: ' + file + '\n' + (result.stderr || result.error));
      }
    }
    count++;
  }
}
for (const dir of ['apps', 'packages', 'scripts', 'tests']) await walk(dir);
console.log('Source lint checks passed: ' + count + ' TypeScript/JavaScript files. Strict types are checked separately.');
