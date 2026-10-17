import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
const pub='11111111-1111-4111-8111-111111111111',bill='22222222-2222-4222-8222-222222222222',version='33333333-3333-4333-8333-333333333333';
const excerpt='<statute> Section One 😃\nNothing in this draft is current law.';
const pack=()=>{
 const provisions=[{id:'section-1',heading:'Section 1',text:excerpt,sha256:hash(excerpt)}];
 return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',
 publisherId:pub,billId:bill,versionId:version,title:'Electronic Draft',language:'en-US',
 jurisdiction:'United States',status:'introduced',publication:'published',sourceComplete:true,
 retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',
 canonicalSha256:hash(excerpt),provisions};
};
async function withServer(lookup,fn){
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:lookup});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const addr=server.address();assert(addr&&typeof addr!=='string');return await fn('http://127.0.0.1:'+addr.port);}
 finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
}
const path='/bills/'+bill+'/versions/'+version;
test('trusted callback is required before an HTTP listener can exist',async()=>{
 await assert.rejects(()=>createPublishedSourceServer({publisherId:'invalid',lookupPublishedPack:async()=>pack()}),/TRUSTED_PUBLICATION_ADAPTER_REQUIRED/);
 await assert.rejects(()=>createPublishedSourceServer({publisherId:pub}),/TRUSTED_PUBLICATION_ADAPTER_REQUIRED/);
});
test('the public endpoint serves exact version, separate stylesheet and JavaScript-free HTML',async()=>withServer(async()=>pack(),async url=>{
 const response=await fetch(url+path);
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
 assert.match(response.headers.get('content-security-policy'),/script-src 'none'/);
 assert.match(response.headers.get('content-security-policy'),/style-src 'self'/);
 assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
 const html=await response.text();
 assert.match(html,/&lt;statute&gt; Section One 😃/);
 assert.match(html,/rel="stylesheet" href="\/public-reader.css"/);
 assert(!html.includes('<script'));
 assert(!html.includes('<statute>'));
 const css=await fetch(url+'/public-reader.css');
 assert.equal(css.status,200);assert.match(await css.text(),/white-space:pre-wrap/);
 const copy=await fetch(url+path+'.txt');
 assert.equal(copy.status,200);assert.match(copy.headers.get('content-type'),/text\/plain/);
 assert.match(await copy.text(),/<statute> Section One 😃/);
 const head=await fetch(url+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.text()).length,0);
}));
test('wrong version, unpublished pack and backend exceptions all get identical privacy-safe 404s',async()=>{
 await withServer(async()=>pack(),async url=>{
  const missing=await fetch(url+'/bills/'+bill+'/versions/00000000-0000-4000-8000-000000000000');
  assert.equal(missing.status,404);assert.equal(await missing.text(),'Not found');
 });
 await withServer(async()=>({...pack(),publication:'reviewed'}),async url=>{
  const unpublished=await fetch(url+path);assert.equal(unpublished.status,404);assert.equal(await unpublished.text(),'Not found');
 });
 await withServer(async()=>{throw Error('private password in DB connection');},async url=>{
  const failed=await fetch(url+path);assert.equal(failed.status,404);assert.equal(await failed.text(),'Not found');
 });
});
test('unknown methods and encoded/query paths cannot enumerate or leak sources',async()=>withServer(async()=>pack(),async url=>{
 const post=await fetch(url+path,{method:'POST'});assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');
 for(const invalid of ['/bills/../../secret','/bills/'+bill+'/versions/'+version+'?token=secret','/bills/%32'+bill.slice(1)+'/versions/'+version,'/not-real']){
  const result=await fetch(url+invalid);assert.equal(result.status,404,invalid);
 }
 const http=await fetch(url+path);assert.equal(http.headers.get('access-control-allow-origin'),null);
 assert.equal(http.headers.get('set-cookie'),null);
}));
