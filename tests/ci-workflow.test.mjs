import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const workflow=await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
test('active GitHub Actions keeps PR and merged main checks without duplicate branch pushes',()=>{
 assert.match(workflow,/on:\n  pull_request:\n  push:\n    branches: \[main\]/);
 assert.doesNotMatch(workflow,/branches: \[main, 'ab-\*'\]/);
 assert.match(workflow,/cancel-in-progress: true/);
});
test('Chromium download cache is keyed to exact pinned version, never secrets',()=>{
 assert.match(workflow,/uses: actions\/cache@v4/);
 assert.match(workflow,/path: ~\/\.cache\/ms-playwright/);
 assert.match(workflow,/key: ask-bill-playwright-\$\{\{ runner\.os \}\}-1\.57\.0-chromium/);
 assert.match(workflow,/python -m pip install playwright==1\.57\.0/);
 assert.match(workflow,/python -m playwright install --with-deps chromium/);
 assert.doesNotMatch(workflow,/\$\{\{ secrets\./i);
});
test('source safety gates remain on every pull request and main build',()=>{
 for(const name of ['quality / foundation and workspace','browser / Chromium reader HTTP smoke','database / PostgreSQL tenancy and migrations','document / PDF review and extraction smoke'])assert(workflow.includes(name));
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/corepack pnpm verify/);
});
