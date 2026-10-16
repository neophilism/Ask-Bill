import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapState, PRODUCT_ID } from '../packages/core/dist/index.js';
import { webBootstrap } from '../apps/web/dist/index.js';
import { apiBootstrap } from '../apps/api/dist/index.js';
import { workerBootstrap } from '../apps/worker/dist/index.js';
import { readFile } from 'node:fs/promises';

test('scaffold contains three independent Ask Bill process surfaces', () => {
  assert.equal(PRODUCT_ID, 'ask-bill');
  for (const [surface, state] of Object.entries({ web: webBootstrap, api: apiBootstrap, worker: workerBootstrap })) {
    assert.equal(state.surface, surface);
    assert.equal(state.productId, PRODUCT_ID);
    assert.equal(state.phase, 'scaffold');
    assert.equal(state.live, false);
    assert.equal(state.providerCredentialsConfigured, false);
    assert.deepEqual(state, bootstrapState(surface));
    assert(Object.isFrozen(state));
  }
});

test('toolchain uses exact package pins and approved CircleCI pipeline', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const toolchain = JSON.parse(await readFile(new URL('../toolchain.json', import.meta.url), 'utf8'));
  const lock = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  const ci = await readFile(new URL('../.circleci/config.yml', import.meta.url), 'utf8');
  assert.equal(manifest.packageManager, 'pnpm@10.18.1');
  assert.equal(manifest.devDependencies.typescript, '5.8.3');
  assert.equal(toolchain.runtime.node, '24.19.0');
  assert.equal(toolchain.providers.liveIntegrationsEnabled, false);
  assert.match(lock, /lockfileVersion: '9\.0'/);
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /pnpm typecheck/);
  assert.match(ci, /pnpm test/);
});
