import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerApplication} from '../apps/worker/application.mjs';
import {probePublisherSourceSandbox} from '../packages/db/publisher-source-extraction.mjs';
const env={ASK_BILL_STAGE:'test',ASK_BILL_PUBLISHER_ID:'ec0a0001-1111-4111-8111-111111111111',
  ASK_BILL_DATABASE_URL:'postgres://fixture@127.0.0.1/askbill_fixture',ASK_BILL_STORAGE_URL:'https://storage.fixture.invalid',
  ASK_BILL_STORAGE_BUCKET:'askbill-fixture',ASK_BILL_STORAGE_ACCESS_KEY_ID:'FIXTUREKEYONLY',
  ASK_BILL_STORAGE_SECRET_ACCESS_KEY:'fixture-secret-only'};
const pool={async connect(){throw Error('test must not open a connection');}};
const storage={async getPrivateSource(){throw Error('not called');}};
const extractSource=async()=>{throw Error('not called');};
const proof={schema:'ask-bill-source-sandbox-v1',isolated:true,checks:{network:true,filesystem:true,environment:true,limits:true},
  limits:{cpuSeconds:90,addressBytes:1073741824,dataBytes:402653184,fileBytes:33554432,processes:32,openFiles:64,tmpBytes:67108864,wallSeconds:115}};
const protocolProbe=value=>probePublisherSourceSandbox({sandboxCommand:process.execPath,
  sandboxArgs:['-e','process.stdout.write('+JSON.stringify(JSON.stringify(value))+')','--']});

test('worker exposes only operational readiness and ignores unrelated web/provider credentials',async()=>{
  const application=await createWorkerApplication({env:{...env,ASK_BILL_ALLOW_LIVE_AI:'malformed',ASK_BILL_LLM_API_KEY:'must-not-enter-worker',
    ASK_BILL_OIDC_CLIENT_SECRET:'must-not-enter-worker',ASK_BILL_SESSION_ENCRYPTION_KEY:'malformed'},pool,storage,extractSource});
  assert.equal(application.readiness.concurrency,1);assert.equal(application.readiness.pollMs,1000);
  assert.equal(application.readiness.containment,'uncontained-test-only');assert.equal(application.readiness.outboxConfigured,false);
  assert.equal(application.readiness.officialImportsEnabled,false);
  assert.doesNotMatch(JSON.stringify(application.readiness),/fixture-secret|must-not-enter-worker|postgres/);
  assert.deepEqual(await application.stop(),{drained:true});assert.deepEqual(await application.runOnce(),{status:'draining'});
});

test('hosted worker rejects test containment overrides and lacks a success path without the real OS probe',async()=>{
  await assert.rejects(()=>createWorkerApplication({env:{...env,ASK_BILL_STAGE:'production',ASK_BILL_ALLOW_UNCONTAINED_SOURCE_TESTS:'true'},pool,storage,extractSource}),e=>e.code==='PARSER_SANDBOX_REQUIRED');
  await assert.rejects(()=>createWorkerApplication({env:{...env,ASK_BILL_STAGE:'production'},pool,storage,extractSource}),e=>e.code==='PARSER_SANDBOX_REQUIRED');
  await assert.rejects(()=>createWorkerApplication({env:{...env,ASK_BILL_STAGE:'production',ASK_BILL_SOURCE_SANDBOX_VERIFIED:'verified',
    ASK_BILL_SOURCE_SANDBOX_COMMAND:'/nonexistent/ask-bill-sandbox'},pool,storage,extractSource}),e=>e.code==='PARSER_SANDBOX_PROBE_FAILED');
});

test('worker configuration rejects unbounded polling, leases, extraction timeouts, and command arguments',async()=>{
  for(const bad of [{ASK_BILL_WORKER_POLL_MS:'0'},{ASK_BILL_WORKER_LEASE_SECONDS:'901'},{ASK_BILL_WORKER_ID:'user-input'},
    {ASK_BILL_SOURCE_EXTRACTION_TIMEOUT_MS:'9999999'},{ASK_BILL_SOURCE_SANDBOX_ARGS:'{"command":"unsafe"}'}]){
    await assert.rejects(()=>createWorkerApplication({env:{...env,...bad},pool,storage,extractSource}),e=>e.code==='WORKER_CONFIGURATION_INVALID');
  }
});

test('sandbox proof validator requires every check and bounded limits (explicit protocol fixtures)',async()=>{
  assert.equal((await protocolProbe(proof)).isolated,true);
  for(const changed of [{...proof,isolated:false},{...proof,checks:{...proof.checks,network:false}},
    {...proof,limits:{...proof.limits,processes:9999}},{schema:'ask-bill-source-sandbox-v1'}]){
    await assert.rejects(()=>protocolProbe(changed),e=>e.code==='PARSER_SANDBOX_PROBE_FAILED');
  }
});
