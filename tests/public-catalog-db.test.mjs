import test from 'node:test';
import assert from 'node:assert/strict';
import {createActiveCatalogLookup,ACTIVE_CATALOG_SQL,CatalogLookupError} from '../packages/db/public-catalog.mjs';
import {renderPublicCatalog} from '../packages/ui/catalog/index.mjs';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
const pub='11111111-1111-4111-8111-111111111111';
const bill='22222222-2222-4222-8222-222222222222';
const ver='33333333-3333-4333-8333-333333333333';
const record={publisher_id:pub,bill_id:bill,version_id:ver,title:'Source Only Bill',status:'introduced'};
function fakePool({rows=[record],throws=false}={}){
 const calls=[],state={released:0,connections:0};
 return {calls,state,async connect(){
  state.connections++;
  return {async query(sql,params){
   calls.push({sql,params});
   if(throws&&sql===ACTIVE_CATALOG_SQL)throw Error('SECRET_DATABASE_CREDENTIAL');
   if(sql===ACTIVE_CATALOG_SQL)return {rows};
   return {rows:[]};
  },release(){state.released++;}};
 }};
}
test('catalog lookup uses only active, published, provenance-bound records with a local tenant transaction',async()=>{
 const pool=fakePool(),lookup=createActiveCatalogLookup({pool,publisherId:pub});
 const result=await lookup({publisherId:pub,page:1});
 assert.equal(result.items.length,1);assert.equal(result.items[0].versionId,ver);
 assert.match(renderPublicCatalog({publisherId:pub,page:1,...result}),/Source Only Bill/);
 assert.equal(pool.calls[0].sql,'BEGIN READ ONLY');
 assert.equal(pool.calls[1].sql,"SELECT set_config('ask_bill.publisher_id', $1, true)");
 assert.deepEqual(pool.calls[2].params,[pub,0]);
 assert.equal(pool.calls[3].sql,'COMMIT');assert.equal(pool.state.released,1);
 assert.match(ACTIVE_CATALOG_SQL,/release_active/);
 assert.match(ACTIVE_CATALOG_SQL,/source_complete=true/);
 assert.match(ACTIVE_CATALOG_SQL,/source_import_events/);
 assert.match(ACTIVE_CATALOG_SQL,/publication='published'/);
});
test('bounded pagination and cross-tenant requests cannot enumerate draft records',async()=>{
 const rows=Array.from({length:21},(_,i)=>({...record,bill_id:String(i+1).padStart(8,'0')+'-2222-4222-8222-222222222222'}));
 const pool=fakePool({rows}),read=createActiveCatalogLookup({pool,publisherId:pub});
 const page=await read({publisherId:pub,page:3});
 assert.equal(page.items.length,20);assert.equal(page.hasNext,true);
 assert.deepEqual(pool.calls[2].params,[pub,40]);
 await assert.rejects(()=>read({publisherId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',page:1}),CatalogLookupError);
 await assert.rejects(()=>read({publisherId:pub,page:10000}),CatalogLookupError);
 assert.equal(pool.state.connections,1);
});
test('mismatched publisher, invalid publication record, and DB exception are not returned',async()=>{
 for(const rows of [[{...record,publisher_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}],[{...record,status:'current_law'}]]){
  const pool=fakePool({rows}),read=createActiveCatalogLookup({pool,publisherId:pub});
  await assert.rejects(()=>read({publisherId:pub,page:1}),e=>e.code==='CATALOG_DATABASE_UNAVAILABLE');
  assert(pool.calls.some(x=>x.sql==='ROLLBACK'));assert.equal(pool.state.released,1);
 }
 const broken=fakePool({throws:true});
 await assert.rejects(()=>createActiveCatalogLookup({pool:broken,publisherId:pub})({publisherId:pub,page:1}),
  e=>e.code==='CATALOG_DATABASE_UNAVAILABLE'&&!e.message.includes('CREDENTIAL'));
});
test('catalog lookup can serve read-only HTTP without exposing a private publisher API',async()=>{
 const pool=fakePool(),lookup=createActiveCatalogLookup({pool,publisherId:pub});
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>null,lookupPublishedCatalog:lookup});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const addr=server.address(),base='http://127.0.0.1:'+addr.port;
  const result=await fetch(base+'/bills');
  assert.equal(result.status,200);assert.match(await result.text(),/Source Only Bill/);
  assert.equal((await fetch(base+'/bills?token=private')).status,404);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
