import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('the TypeScript gate rejects an intentional static type defect', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ask-bill-negative-ts-'));
  try {
    const file = join(dir, 'invalid.ts');
    await writeFile(file, 'const wrong: string = 123;\n', 'utf8');
    const compiler = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
    const result = spawnSync(compiler, ['--strict', '--noEmit', '--target', 'ES2022', file],
      { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined, 'TypeScript executable must be present in the pnpm test PATH');
    assert.notEqual(result.status, 0, 'Intentionally invalid TypeScript must fail the build');
    assert.match(result.stdout + result.stderr, /TS2322/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
