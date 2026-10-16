import test from 'node:test';
import assert from 'node:assert/strict';
import {createJobWorker,createOutboxWorker,JobError} from '../packages/jobs/index.mjs';

const publisherId='11111111-1111-4111-8111-111111111111';
const workerId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const jobId='cccccccc-0000-4000-8000-000000000001';
const eventId='dddddddd-0000-4000-8000-000000000001';
const payload={type:'source.indexed',idempotencyKey:'index:v1',payload:{sourceVersionId:'v1'}};
function fakeStore(){
 const log=[];
 let jobReady=true, eventReady=true, fence=1, eventFence=1;
 const store={
  log,
  claimJob:async ctx=>{log.push(['claimJob',ctx.publisherId]);if(!jobReady)return null;jobReady=false;return {jobId,kind:'index',fence};},
  heartbeatJob:async scope=>{log.push(['heartbeat',scope.fence]);return scope.fence===fence;},
  completeJobAndEnqueue:async scope=>{log.push(['complete',scope.fence,scope.event?.idempotencyKey]);return scope.fence===fence;},
  failJob:async scope=>{log.push(['failJob',scope.retry,scope.errorCode]);return scope.fence===fence;},
  claimOutbox:async()=>{if(!eventReady)return null;eventReady=false;return {eventId,fence:eventFence,...payload};},
  ackOutbox:async scope=>{log.push(['ack',scope.fence]);return scope.fence===eventFence;},
  failOutbox:async scope=>{log.push(['failOutbox',scope.retry,scope.errorCode]);return scope.fence===eventFence;},
  advanceJobFence:()=>{fence++;},
  advanceOutboxFence:()=>{eventFence++;eventReady=true;},
  resetOutbox:()=>{eventReady=true;}
 };
 return store;
}
const make=(store,handleJob,opts={})=>createJobWorker({store,publisherId,workerId,handleJob,...opts});
test('jobs preserve source identity, heartbeat, and atomic fenced completion',async()=>{
 const store=fakeStore();const worker=make(store,async claim=>{
  assert.equal(claim.jobId,jobId);assert.equal(claim.kind,'index');
  assert.equal(await claim.heartbeat(),true);return payload;
 });
 assert.deepEqual(await worker.runOnce(),{status:'completed'});
 assert.deepEqual(await worker.runOnce(),{status:'idle'});
 assert.deepEqual(store.log.map(x=>x[0]),['claimJob','heartbeat','complete','claimJob']);
});
test('a stale worker cannot commit after another lease holder increases fence',async()=>{
 const store=fakeStore();const worker=make(store,async()=>{store.advanceJobFence();return payload;});
 assert.deepEqual(await worker.runOnce(),{status:'lost-lease'});
 assert.equal(store.log.find(x=>x[0]==='complete')[1],1);
});
test('unexpected failure becomes bounded retry with no leaked input or stack trace',async()=>{
 const store=fakeStore();const worker=make(store,async()=>{throw new Error('secret: source body and private token')});
 const result=await worker.runOnce();assert.equal(result.status,'retry');
 assert.equal(result.errorCode,'PROCESSING_FAILED');assert(!JSON.stringify(result).includes('secret'));
 assert.deepEqual(store.log.find(x=>x[0]==='failJob'),['failJob',true,'PROCESSING_FAILED']);
});
test('nonretryable invalid job result is dead-lettered without user supplied diagnostics',async()=>{
 const store=fakeStore();const worker=make(store,async()=>({...payload,type:'evil <script>'}));
 const result=await worker.runOnce();assert.equal(result.status,'dead-letter');
 assert.equal(result.errorCode,'INVALID_EVENT');
 assert.deepEqual(store.log.find(x=>x[0]==='failJob'),['failJob',false,'INVALID_EVENT']);
});
test('permanent JobError sends a sanitized code and never retries',async()=>{
 const store=fakeStore();const worker=make(store,async()=>{throw new JobError('SOURCE_INCOMPLETE')});
 assert.deepEqual(await worker.runOnce(),{status:'dead-letter',errorCode:'SOURCE_INCOMPLETE'});
});
test('outbox sends idempotency keys and acknowledges only the current delivery fence',async()=>{
 const store=fakeStore();let delivered=[];
 const worker=createOutboxWorker({store,publisherId,workerId,deliver:async x=>(delivered.push(x),true)});
 assert.deepEqual(await worker.runOnce(),{status:'delivered'});
 assert.deepEqual(await worker.runOnce(),{status:'idle'});
 assert.equal(delivered.length,1);assert.equal(delivered[0].idempotencyKey,'index:v1');
 assert.deepEqual(store.log.find(x=>x[0]==='ack'),['ack',1]);
});
test('network ack crash can replay one event; consumers must de-duplicate idempotency key',async()=>{
 const store=fakeStore();let delivered=[];
 const worker=createOutboxWorker({store,publisherId,workerId,deliver:async x=>(delivered.push(x.idempotencyKey),true)});
 store.advanceOutboxFence();
 assert.deepEqual(await worker.runOnce(),{status:'delivered'});
 assert.deepEqual(delivered,['index:v1']);
 store.advanceOutboxFence();
 assert.deepEqual(await worker.runOnce(),{status:'delivered'});
 assert.deepEqual(delivered,['index:v1','index:v1']);
});
test('outbox permanent or transient failures are safely classified',async()=>{
 const a=fakeStore();const retry=createOutboxWorker({store:a,publisherId,workerId,deliver:async()=>false});
 assert.deepEqual(await retry.runOnce(),{status:'retry',errorCode:'DELIVERY_FAILED'});
 const b=fakeStore();const dead=createOutboxWorker({store:b,publisherId,workerId,deliver:async()=>{throw new JobError('REJECTED')}});
 assert.deepEqual(await dead.runOnce(),{status:'dead-letter',errorCode:'REJECTED'});
});
test('invalid tenant, worker, lease and absent dependency are rejected up front',()=>{
 for(const publisher of ['not-uuid',"'; DROP TABLE jobs; --",undefined])
  assert.throws(()=>make(fakeStore(),async()=>payload,{publisherId:publisher}),JobError);
 assert.throws(()=>make(fakeStore(),async()=>payload,{leaseSeconds:0}),JobError);
 assert.throws(()=>make({},async()=>payload),JobError);
 assert.throws(()=>make(fakeStore(),null),JobError);
 assert.throws(()=>createOutboxWorker({store:fakeStore(),publisherId,workerId,deliver:null}),JobError);
});
test('oversize event is never completed, and diagnostic has no payload content',async()=>{
 const store=fakeStore(),worker=make(store,async()=>({...payload,payload:{document:'x'.repeat(40000)}}));
 const result=await worker.runOnce();
 assert.equal(result.status,'dead-letter');assert.equal(result.errorCode,'EVENT_TOO_LARGE');
 assert.equal(store.log.find(x=>x[0]==='complete'),undefined);
});
test('migration enforces FORCE RLS via existing parent and invoker-scoped fenced functions',async()=>{
 const {readFile}=await import('node:fs/promises');
 const sql=await readFile(new URL('../migrations/002_jobs.sql',import.meta.url),'utf8');
 assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;\s*$/);
 assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|COLUMN|SCHEMA)\b/i);
 for(const name of ['enqueue_job','claim_job','heartbeat_job','complete_job_and_enqueue','fail_job','reap_expired_jobs','claim_outbox','ack_outbox','fail_outbox','reap_expired_outbox']){
  assert(sql.includes(`ask_bill.${name}`));
  assert(sql.includes('SECURITY INVOKER'));
 }
 assert(sql.includes('FOR UPDATE SKIP LOCKED'));
 assert(sql.includes('ON CONFLICT(publisher_id,idempotency_key) DO NOTHING'));
 assert(sql.includes('last_error_code'));
});
