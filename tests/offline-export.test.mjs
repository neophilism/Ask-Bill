import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = fileURLToPath(new URL('../scripts/export-offline-preview.mjs', import.meta.url));

test('exporter creates a genuinely offline, explicitly incomplete-source demo', async () => {
  await mkdir(join(root, 'dist'), { recursive: true });
  const dir = await mkdtemp(join(root, 'dist/offline-smoke-'));
  try {
    const result = spawnSync(process.execPath, [path, relative(root, dir)], { encoding: 'utf8', timeout: 15_000 });
    assert.equal(result.status, 0, result.stderr);
    const [html, js, css, readme] = await Promise.all(['index.html','preview.js','preview.css','README.txt']
      .map(file => readFile(join(dir, file), 'utf8')));
    assert.match(html, /Incomplete draft excerpt/);
    assert.match(html, /not a full bill, enacted law/);
    assert.match(html, /src="\.\/preview\.js"/);
    assert.match(html, /href="\.\/preview\.css"/);
    assert.doesNotMatch(html, /src="\/preview\.js"|href="\/preview\.css"/);
    assert.match(js, /data-demo/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(readme, /No server or account/);
    assert.doesNotMatch(html + js, /Law Machine|fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('exporter refuses destination paths outside dist/', () => {
  const result = spawnSync(process.execPath, [path, '../outside-export'], { encoding: 'utf8', timeout: 15_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Exports must be placed/);
});
