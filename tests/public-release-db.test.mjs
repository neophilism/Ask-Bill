import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createActiveReleaseLookup,ACTIVE_RELEASE_SQL,PUBLIC_PROVISIONS_SQL,PublicReleaseLookupError} from '../packages/db/public-release.mjs';
import {renderPublishedReader} from '../packages/ui/reader/index.mjs';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const publisher='11111111-1111-4111-8111-111111111111';
const bill='22222222-2222-4222-8222-222222222222';
const version='33333333-3333-4333-8333-333333333333';
const provisionId='44444444-4444-4444-8444-444444444444';
const section='A proposed public source includes an exception 😃.';
function fixture(changes={}){
 return {publisher_id:publisher,bill_id:bill,version_id:version,title:'A Draft Act',jurisdiction:'United States',
   status:'introduced',language:'en-US',retrieved_at:new Date('2026-10-16T20:00:00Z'),
   published_at:new Date('2026-10-16T22:00:00Z'),canonicalization_version:'reader-canon-v1',
   canonical_text_sha256:hash(section),...changes};
}
function fakePool({released=[fixture()],sections=[{id:provisionId,provision_path:'1',heading:'Section 1',canonical_text:section}],error=null}={}){
 const calls=[],state={released:0,connected:0};
 return {calls,state,async connect(){
  state.connected++;
  return {async query(sql,params){
   calls.push({sql,params});
   if(error&&sql===error)throw new Error('PRIVATE_CONNECTION_DETAILS_MUST_NOT_LEAK');
   if(sql===ACTIVE_RELEASE_SQL)return {rows:released};
   if(sql===PUBLIC_PROVISIONS_SQL)return {rows:sections};
   return {rows:[]};
  },release(){state.released++}};
 }};
}
test('only active released complete versions are fetched in tenant-bound read-only transactions',async()=>{
 const pool=fakePool(),lookup=createActiveReleaseLookup({pool,publisherId:publisher});
 const result=await lookup({publisherId:publisher,billId:bill,versionId:version});
 assert.equal(result.title,'A Draft Act');
 assert.equal(result.provisions.length,1);
 assert.equal(result.provisions[0].text,section);
 assert.match(renderPublishedReader(result),/proposed public source/);
 assert.equal(pool.calls[0].sql,'BEGIN READ ONLY');
 assert.equal(pool.calls[1].sql,"SELECT set_config('ask_bill.publisher_id', $1, true)");
 assert.deepEqual(pool.calls[1].params,[publisher]);
 assert.deepEqual(pool.calls[2].params,[publisher,bill,version]);
 assert.deepEqual(pool.calls[3].params,[publisher,version]);
 assert.equal(pool.calls[4].sql,'COMMIT');
 assert.equal(pool.state.released,1);
 assert.match(ACTIVE_RELEASE_SQL,/JOIN ask_bill.release_active|FROM ask_bill.release_active/);
 assert.match(ACTIVE_RELEASE_SQL,/source_complete=true/);
 assert.match(ACTIVE_RELEASE_SQL,/publication='published'/);
 assert.match(ACTIVE_RELEASE_SQL,/source_import_events/);
});
test('wrong publisher never connects and missing or tampered records fail closed',async()=>{
 const pool=fakePool(),lookup=createActiveReleaseLookup({pool,publisherId:publisher});
 assert.equal(await lookup({publisherId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',billId:bill,versionId:version}),null);
 assert.equal(pool.state.connected,0);
 for(const opt of [
  {released:[]},{released:[fixture({version_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})]},
  {released:[fixture({canonical_text_sha256:hash('different')})]},
  {released:[fixture({canonicalization_version:'untrusted'})]},
  {sections:[]},{sections:[{id:provisionId,heading:'Section 1',provision_path:'1',canonical_text:'tampered'}]}
 ]){
  const candidate=fakePool(opt);
  assert.equal(await createActiveReleaseLookup({pool:candidate,publisherId:publisher})({publisherId:publisher,billId:bill,versionId:version}),null);
  assert.equal(candidate.state.released,1);
  assert(candidate.calls.some(c=>c.sql==='ROLLBACK'));
 }
});
test('database errors roll back without exposing credentials or private source',async()=>{
 const pool=fakePool({error:ACTIVE_RELEASE_SQL});
 const load=createActiveReleaseLookup({pool,publisherId:publisher});
 assert.equal(await load({publisherId:publisher,billId:bill,versionId:version}),null);
 assert.equal(pool.state.released,1);
 assert(pool.calls.some(c=>c.sql==='ROLLBACK'));
 assert.throws(()=>createActiveReleaseLookup({pool:{},publisherId:publisher}),PublicReleaseLookupError);
});
test('an explicit HTTP reader can use only the trusted DB adapter',async()=>{
 const pool=fakePool(),lookup=createActiveReleaseLookup({pool,publisherId:publisher});
 const server=await createPublishedSourceServer({publisherId:publisher,lookupPublishedPack:lookup});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const addr=server.address(),res=await fetch('http://127.0.0.1:'+addr.port+'/bills/'+bill+'/versions/'+version);
  assert.equal(res.status,200);assert.match(await res.text(),/Draft Act/);
  assert.equal(pool.state.released,1);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
