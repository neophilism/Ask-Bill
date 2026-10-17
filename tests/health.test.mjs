import test from 'node:test';
import assert from 'node:assert/strict';
import {createHealthMonitor,healthHttpResponse,HealthConfigError} from '../apps/web/health/monitor.mjs';
import {createHealthOnlyServer} from '../apps/web/health/health-server.mjs';
const names=['database','objectStorage','publisherIdentity','jobQueue'];
const healthy=Object.fromEntries(names.map(name=>[name,async()=>true]));
test('local preview is explicitly not production-ready; schema revision is exposed',async()=>{
 const h=createHealthMonitor({stage:'local',buildSha:'abcdef012345',schemaVersion:2,expectedSchemaVersion:2});
 const r=await h.readiness();
 assert.equal(r.status,'ready');assert.equal(r.productionCapable,false);assert.equal(r.scope,'offline-preview-only');
 assert.equal(r.version.schemaVersion,2);
 assert.equal((await healthHttpResponse(h)).status,200);
 h.beginDrain();assert.equal((await h.readiness()).status,'not_ready');
 assert.equal((await healthHttpResponse(h)).status,503);
 assert.equal(h.liveness().status,'alive');
});
test('staging and production deny readiness with missing, failing, or stale dependencies',async()=>{
 for(const stage of ['staging','production']){
  assert.equal((await createHealthMonitor({stage}).readiness()).status,'not_ready');
  assert.equal((await createHealthMonitor({stage,probes:healthy,schemaVersion:1,expectedSchemaVersion:2}).readiness()).status,'not_ready');
  assert.equal((await createHealthMonitor({stage,probes:{...healthy,database:async()=>false}}).readiness()).dependencies.database,'unavailable');
  assert.equal((await createHealthMonitor({stage,probes:healthy}).readiness()).status,'ready');
 }
});
test('dependency exceptions/timeouts never disclose private details',async()=>{
 const probes={...healthy,objectStorage:()=>{throw Error('secret-credential-should-not-appear')}};
 const h=createHealthMonitor({stage:'staging',probes});
 const result=await healthHttpResponse(h);
 assert.equal(result.status,503);assert.equal(JSON.parse(result.body).dependencies.objectStorage,'unavailable');
 assert(!result.body.includes('secret-credential'));
 const timed=createHealthMonitor({stage:'staging',probes:{...healthy,jobQueue:()=>new Promise(()=>{})},timeoutMs:25});
 const r=await timed.readiness();assert.equal(r.dependencies.jobQueue,'timeout');
});
test('health endpoints use GET/HEAD and no caching or arbitrary server paths',async()=>{
 const monitor=createHealthMonitor({stage:'local'});
 const server=createHealthOnlyServer(monitor);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  const url='http://127.0.0.1:'+address.port;
  const ready=await fetch(url+'/health/ready');assert.equal(ready.status,200);
  assert.equal((await ready.json()).product,'ask-bill');
  assert.equal(ready.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(url+'/health/live')).status,200);
  const head=await fetch(url+'/health/ready',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await fetch(url+'/health/live',{method:'POST'})).status,405);
  assert.equal((await fetch(url+'/private')).status,404);
  monitor.beginDrain();
  assert.equal((await fetch(url+'/health/ready')).status,503);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
test('malformed or client-influenced config cannot leak into status',()=>{
 assert.throws(()=>createHealthMonitor({buildSha:'not a sha\nSECRET'}),HealthConfigError);
 assert.throws(()=>createHealthMonitor({stage:'preview'}),HealthConfigError);
 assert.throws(()=>createHealthMonitor({probes:{customSecret:()=>true}}),HealthConfigError);
 assert.throws(()=>createHealthMonitor({timeoutMs:0}),HealthConfigError);
 assert.throws(()=>createHealthMonitor({expectedSchemaVersion:-1}),HealthConfigError);
});

test('actual local reader also supplies scoped readiness without external providers',async()=>{
 const {createPreviewServer}=await import('../apps/web/preview/server.mjs');
 const server=await createPreviewServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();assert(address&&typeof address!=='string');
  const url='http://127.0.0.1:'+address.port;
  const ready=await fetch(url+'/health/ready');assert.equal(ready.status,200);
  const body=await ready.json();assert.equal(body.scope,'offline-preview-only');assert.equal(body.productionCapable,false);
  assert.equal((await fetch(url+'/health/live')).status,200);
  assert.equal((await fetch(url+'/health/ready',{method:'POST'})).status,405);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
