import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runSourceSandboxSmoke,SourceSandboxSmokeError} from './sandbox/source-sandbox-smoke.mjs';

const command=fileURLToPath(new URL('../infra/run-source-sandbox.sh',import.meta.url));
const entry='/opt/ask-bill/apps/worker/source-import/extract.mjs';
const version='12345678-1234-4234-9234-123456789abc';
const invoke=(args,options={})=>spawnSync(command,args,{encoding:'utf8',timeout:15000,maxBuffer:16384,
  env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},...options});

test('source sandbox refuses command injection, alternate entries, unsupported MIME and malformed IDs before starting a runtime',()=>{
  for (const args of [[],['--probe','extra'],['-e','process.exit(0)'],
    ['--max-old-space-size=4096',entry,'text/plain',version],
    ['--max-old-space-size=192','/tmp/attacker.mjs','text/plain',version],
    ['--max-old-space-size=192',entry,'application/javascript',version],
    ['--max-old-space-size=192',entry,'text/plain','../private'],
    ['--max-old-space-size=192',entry,'text/plain','12345678-1234-0234-1234-123456789abc'],
    ['--max-old-space-size=192',entry,'text/plain',version,'--require=/tmp/attack.cjs']]) {
    const result=invoke(args);
    assert.equal(result.error,undefined);
    assert.equal(result.status,64);
    assert.equal(result.stdout,'');
    assert.equal(result.stderr,'SOURCE_SANDBOX_ARGUMENTS_INVALID\n');
  }
});

test('root cannot bypass process limits or request an uncontained production fallback',()=>{
  if (process.getuid?.()!==0) return;
  const result=invoke(['--max-old-space-size=192',entry,'text/plain',version],{
    input:'Never process this outside containment.',
    env:{PATH:'/usr/bin:/bin',NODE_ENV:'production',ASK_BILL_ALLOW_UNCONTAINED_SOURCE_TESTS:'true',
      ASK_BILL_SOURCE_SANDBOX_VERIFIED:'verified'}});
  assert.equal(result.status,78);
  assert.equal(result.stdout,'');
  assert.equal(result.stderr,'SOURCE_SANDBOX_NON_ROOT_REQUIRED\n');
});

test('caller PATH and preload environment cannot replace sandbox utilities or run before validation',()=>{
  const directory=mkdtempSync(join(tmpdir(),'ask-bill-sandbox-env-'));
  try {
    const marker=join(directory,'executed');
    const preload=join(directory,'preload.cjs');
    writeFileSync(preload,'require("node:fs").writeFileSync('+JSON.stringify(marker)+',"executed")');
    for (const name of ['node','bwrap','id','env','timeout','prlimit','grep'])
      writeFileSync(join(directory,name),'#!/bin/sh\n: > "'+marker+'"\nexit 0\n',{mode:0o755});
    const result=invoke(['--max-old-space-size=192','/tmp/attacker.mjs','text/plain',version],{
      env:{PATH:directory,NODE_OPTIONS:'--require='+preload,NODE_PATH:directory,ENV:preload,BASH_ENV:preload}});
    assert.equal(result.status,64);
    assert.equal(result.stdout,'');
    assert.equal(existsSync(marker),false);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});

test('operational smoke command exits unsuccessfully if containment or its prerequisites are unavailable',()=>{
  assert.throws(()=>runSourceSandboxSmoke('relative-command'),{code:'SOURCE_SANDBOX_COMMAND_INVALID'});
  assert.throws(()=>runSourceSandboxSmoke('/nonexistent/ask-bill-source-sandbox'),{code:'SOURCE_SANDBOX_UNAVAILABLE'});
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./sandbox/source-sandbox-smoke.mjs',import.meta.url)),
    '/nonexistent/ask-bill-source-sandbox'],{encoding:'utf8',timeout:15000,maxBuffer:16384});
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.match(result.stderr,/SOURCE_SANDBOX_UNAVAILABLE: upload parsing must remain disabled/);
});

test('real production boundary proves no network, private files or inherited environment and enforces kernel limits',async t=>{
  let report;
  try { report=runSourceSandboxSmoke(command); }
  catch (error) {
    assert.ok(error instanceof SourceSandboxSmokeError);
    if (process.env.ASK_BILL_REQUIRE_SOURCE_SANDBOX==='1') throw error;
    t.skip('Production layout/non-root namespaces unavailable here. Operational --probe fails closed; isolation is not verified.');
    return;
  }
  assert.equal(report.isolated,true);
  assert.deepEqual(report.checks,{network:true,filesystem:true,environment:true,limits:true});
  // A passing probe must still be able to parse actual input using the same entry,
  // pipe transport, read-only modules and limits. No alternative test extractor.
  const text='Section 1. A readable proposed source.\n\nException: diplomatic applications are excluded.';
  const parsed=invoke(['--max-old-space-size=192',entry,'text/plain',version],{input:text});
  assert.equal(parsed.status,0);
  const output=JSON.parse(parsed.stdout);
  assert.equal(output.canonicalText,text);
  assert.equal(output.parserVersion,'publisher-extract-v1');
  const malicious=invoke(['--max-old-space-size=192',entry,'application/xml',version],{
    input:'<?xml version="1.0"?><!DOCTYPE bill [<!ENTITY leak SYSTEM "file:///etc/passwd">]><bill><text>&leak;</text></bill>'});
  assert.notEqual(malicious.status,0);
  assert.equal(malicious.stdout,'');
  assert.ok(!malicious.stderr.includes('root:'));
});
