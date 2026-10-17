import test from 'node:test';import assert from 'node:assert/strict';
import {createExpiredSessionCleaner,RetentionError} from '../packages/privacy/retention.mjs';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const t=Date.parse('2026-10-17T12:00:00Z'),cutoff=new Date(t-60000);
function fakePool({failAt='',badRow}={}){
 const calls=[];let released=0;
 return {calls,get released(){return released},async connect(){return{
   async query(sql,params){calls.push({sql,params});if(failAt&&sql.includes(failAt))throw Error('PRIVATE_DB_ERROR');
     if(sql.startsWith('SELECT * FROM ask_bill.expire_session_data'))return {rows:[badRow??{sessions_removed:1,reservations_removed:2}]};
     return {rows:[]};
   },release(){released++;}
 }}};
}
test('only a server-authenticated tenant can delete expired records in a scoped transaction',async()=>{
 const pool=fakePool(),cleaner=createExpiredSessionCleaner({pool,trustedPublisherId:id,now:()=>t});
 const result=await cleaner.clean({cutoff,limit:4});
 assert.deepEqual(result,{publisherId:id,sessionsRemoved:1,reservationsRemoved:2,moreBatchesMayRemain:false});
 assert.deepEqual(pool.calls.map(x=>x.sql),['BEGIN',"SELECT set_config('ask_bill.publisher_id',$1,true)",
  'SELECT * FROM ask_bill.expire_session_data($1::uuid,$2::timestamptz,$3::integer)','COMMIT']);
 assert.deepEqual(pool.calls[2].params,[id,cutoff.toISOString(),4]);
 assert(pool.calls.every(x=>!x.sql.includes(id)));assert.equal(pool.released,1);
 assert(Object.isFrozen(result));
});
test('cross-publisher deletion, future cutoffs, oversized or malformed batches fail before connecting',async()=>{
 const pool=fakePool(),cleaner=createExpiredSessionCleaner({pool,trustedPublisherId:id,now:()=>t});
 for(const args of [{publisherId:other},{publisherId:'; DROP TABLE sessions'}, {cutoff:new Date(t+1000)},
                    {cutoff:'tomorrow'},{limit:0},{limit:101},{limit:'50'}]){
  await assert.rejects(cleaner.clean(args),RetentionError);
 }
 assert.equal(pool.calls.length,0);assert.equal(pool.released,0);
});
test('database failures and contradictory deletion counts roll back and release the connection',async()=>{
 for(const scenario of [{failAt:'expire_session_data'},{badRow:{sessions_removed:5,reservations_removed:2}},
                         {badRow:{sessions_removed:0,reservations_removed:-1}}]){
  const pool=fakePool(scenario),cleaner=createExpiredSessionCleaner({pool,trustedPublisherId:id,now:()=>t});
  await assert.rejects(cleaner.clean({limit:3,cutoff}));
  assert(pool.calls.some(x=>x.sql==='ROLLBACK'));assert(!pool.calls.some(x=>x.sql==='COMMIT'));
  assert.equal(pool.released,1);
 }
});
test('deletion audit returns only count and publisher ID, never expired capability hashes',async()=>{
 const pool=fakePool({badRow:{sessions_removed:3,reservations_removed:3}});
 const cleaner=createExpiredSessionCleaner({pool,trustedPublisherId:id,now:()=>t});
 const result=await cleaner.clean({cutoff,limit:3});
 assert.equal(result.moreBatchesMayRemain,true);assert.deepEqual(Object.keys(result).sort(),['moreBatchesMayRemain','publisherId','reservationsRemoved','sessionsRemoved']);
 assert(!JSON.stringify(result).includes('capability'));assert(!JSON.stringify(result).includes('token'));
});
