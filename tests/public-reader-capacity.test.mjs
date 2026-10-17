import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';

const publisher='11111111-1111-4111-8111-111111111111';
const bill='22222222-2222-4222-8222-222222222222';
const version='33333333-3333-4333-8333-333333333333';
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const text='A published synthetic proposal with an explicit exception.';
const pack=()=>({
 schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId:publisher,
 billId:bill,versionId:version,title:'Synthetic Bill',jurisdiction:'United States',
 language:'en-US',status:'introduced',publication:'published',sourceComplete:true,
 retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',
 canonicalSha256:hash(text),provisions:[{id:'section-1',heading:'Section 1',text,sha256:hash(text)}]
});
const path='/bills/'+bill+'/versions/'+version;
async function withServer(options,run){
 const server=await createPublishedSourceServer({publisherId:publisher,maxInflight:1,...options});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const addr=server.address();assert(addr&&typeof addr!=='string');
  return await run('http://127.0.0.1:'+addr.port,server);
 }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
test('one in-flight document blocks additional source queries, then frees capacity on completion',async()=>{
 let allow,started;const firstStarted=new Promise(resolve=>{started=resolve});
 const delayed=new Promise(resolve=>{allow=resolve});let first=true;
 await withServer({lookupPublishedPack:async()=>{
  if(first){first=false;started();return await delayed;}return pack();
 }},async url=>{
  const pending=fetch(url+path);await firstStarted;
  const busy=await fetch(url+path);
  assert.equal(busy.status,503);
  assert.equal(busy.headers.get('retry-after'),'2');
  assert.equal(busy.headers.get('cache-control'),'no-store');
  assert.match(await busy.text(),/temporarily busy/);
  allow(pack());
  assert.equal((await pending).status,200);
  const next=await fetch(url+path);
  assert.equal(next.status,200);
  assert.match(await next.text(),/Synthetic Bill/);
 });
});
test('a delayed catalog lookup uses the same bounded backend capacity as bill text',async()=>{
 let started,allow;const entered=new Promise(resolve=>{started=resolve});
 const deferred=new Promise(resolve=>{allow=resolve});
 await withServer({lookupPublishedPack:async()=>pack(),
  lookupPublishedCatalog:async()=>{started();return await deferred;}},async url=>{
  const catalog=fetch(url+'/bills');await entered;
  assert.equal((await fetch(url+path)).status,503);
  const style=await fetch(url+'/public-reader.css');
  assert.equal(style.status,200,'Static CSS remains available under load');
  allow({items:[{publisherId:publisher,billId:bill,versionId:version,title:'Synthetic Bill',
   status:'introduced',publication:'published',sourceComplete:true}],hasNext:false});
  assert.equal((await catalog).status,200);
  assert.equal((await fetch(url+path)).status,200);
 });
});
test('failed lookups release capacity without exposing backend exception details',async()=>{
 let first=true;
 await withServer({lookupPublishedPack:async()=>{if(first){first=false;throw Error('private connection password');}return pack();}},async url=>{
  const failed=await fetch(url+path);assert.equal(failed.status,404);
  assert.equal(await failed.text(),'Not found');
  const next=await fetch(url+path);assert.equal(next.status,200);
 });
});
test('capacity and transport limits fail closed under invalid configuration',async()=>{
 for(const capacity of [0,-1,257,1.5,'2',null]){
  await assert.rejects(()=>createPublishedSourceServer({publisherId:publisher,lookupPublishedPack:async()=>pack(),maxInflight:capacity}),/INVALID_PUBLIC_READER_CAPACITY/);
 }
 await withServer({lookupPublishedPack:async()=>pack()},async(_url,server)=>{
  assert.equal(server.headersTimeout,10000);
  assert.equal(server.requestTimeout,20000);
  assert.equal(server.keepAliveTimeout,5000);
  assert.equal(server.maxRequestsPerSocket,100);
 });
});
