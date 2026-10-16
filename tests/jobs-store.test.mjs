import test from 'node:test';
import assert from 'node:assert/strict';
import {createPgJobStore} from '../packages/jobs/pg-store.mjs';
import {JobError} from '../packages/jobs/index.mjs';
const pub='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const work='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const job='cccccccc-0000-4000-8000-000000000001';
const eventId='dddddddd-0000-4000-8000-000000000001';
const storeFactory=(response={rows:[]})=>{
 const calls=[];
 const pool={connect:async()=>({
  query:async(sql,params)=>{calls.push([sql,params]);if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SELECT set_config'))return {rows:[]};return response;},
  release:()=>{calls.push(['release'])}
 })};
 return {store:createPgJobStore({pool,trustedPublisherId:pub}),calls};
};
test('adapter scopes each operation to the fixed trusted tenant in its own transaction',async()=>{
 const {store,calls}=storeFactory({rows:[{id:job,ok:true}]});
 assert.equal(await store.enqueueJob({publisherId:pub,kind:'ingest',dedupeKey:'source-x'}),job);
 assert.deepEqual(calls.map(x=>x[0]),['BEGIN',"SELECT set_config('ask_bill.publisher_id',$1,true)",'SELECT ask_bill.enqueue_job($1::uuid,$2::text,$3::text) AS id','COMMIT','release']);
 assert.deepEqual(calls[2][1],[pub,'ingest','source-x']);
 const ctx={publisherId:pub,workerId:work,leaseSeconds:30,jobId:job,fence:1};
 await store.heartbeatJob(ctx);
 assert(calls.some(x=>x[0].includes('ask_bill.heartbeat_job')));
 await store.completeJobAndEnqueue({...ctx,event:{type:'published',idempotencyKey:'job-one',payload:{id:'v1'}}});
 const c=calls.find(x=>x[0].includes('complete_job_and_enqueue'));
 assert(c&&c[1][6]==='{"id":"v1"}');
 await store.reapExpiredJobs({publisherId:pub});
 assert(calls.some(x=>x[0].includes('reap_expired_jobs')));
});
test('untrusted tenant selector is rejected before a connection is acquired',async()=>{
 const {store,calls}=storeFactory();
 await assert.rejects(()=>store.claimJob({publisherId:other,workerId:work,leaseSeconds:30}),JobError);
 await assert.rejects(()=>store.enqueueJob({publisherId:other,kind:'ingest',dedupeKey:'x'}),JobError);
 await assert.rejects(()=>store.reapExpiredOutbox({publisherId:other}),JobError);
 assert.equal(calls.length,0);
});
test('claim and ack only use parameterized PostgreSQL functions and parse fence values',async()=>{
 const {store,calls}=storeFactory({rows:[{job_id:job,job_kind:'ingest',fence_version:'3',lease_expires:'tomorrow',event_id:eventId,event_type:'published',idempotency_key:'job-one',event_payload:{source:'v1'}}]});
 const claim=await store.claimJob({publisherId:pub,workerId:work,leaseSeconds:30});
 assert.deepEqual(claim,{jobId:job,kind:'ingest',fence:3,leaseExpires:'tomorrow'});
 const event=await store.claimOutbox({publisherId:pub,workerId:work,leaseSeconds:30});
 assert.equal(event.eventId,eventId);assert.equal(event.fence,3);
 await store.ackOutbox({publisherId:pub,eventId,workerId:work,fence:3});
 await store.failOutbox({publisherId:pub,eventId,workerId:work,fence:3,retry:true,errorCode:'HTTP_FAILED'});
 assert(calls.some(x=>x[0].includes('ask_bill.ack_outbox')));
 assert(calls.some(x=>x[0].includes('ask_bill.fail_outbox')));
 for(const [sql,params] of calls){assert(!sql.includes(pub));assert(!sql.includes(job));if(sql.includes('ask_bill.')&&!sql.includes('publisher_id'))assert(Array.isArray(params));}
});
test('connection failure triggers rollback and always releases pool client',async()=>{
 const calls=[];
 const pool={connect:async()=>({query:async sql=>{calls.push(sql);if(sql.includes('ask_bill.enqueue_job'))throw new Error('simulated db lost');return {rows:[]}},release:()=>{calls.push('release')}})};
 const store=createPgJobStore({pool,trustedPublisherId:pub});
 await assert.rejects(()=>store.enqueueJob({publisherId:pub,kind:'test',dedupeKey:'one'}),/simulated db lost/);
 assert.deepEqual(calls.slice(-2),['ROLLBACK','release']);
});
test('invalid pool or unsigned publisher identity cannot construct adapter',()=>{
 assert.throws(()=>createPgJobStore({pool:{},trustedPublisherId:pub}),JobError);
 assert.throws(()=>createPgJobStore({pool:{connect:()=>{}},trustedPublisherId:'fake'}),JobError);
});
