import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
import {findExactPublishedText,renderSourceSearchResults,ReaderSearchError} from '../packages/ui/reader/find.mjs';
const sha=t=>createHash('sha256').update(t,'utf8').digest('hex');
const pub='11111111-1111-4111-8111-111111111111',bill='22222222-2222-4222-8222-222222222222',version='33333333-3333-4333-8333-333333333333';
const texts=['A Bill 😃 grants ACCESS with an exception.','The other Access provision matters.'];
const pack=()=>{const provisions=texts.map((t,i)=>({id:'sec-'+(i+1),heading:i===0?'Part <one>':'Part & two',text:t,sha256:sha(t)}));return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId:pub,billId:bill,versionId:version,title:'Draft source',jurisdiction:'US',language:'en-US',status:'introduced',publication:'published',sourceComplete:true,retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',canonicalSha256:sha(texts.join('\n\n')),provisions};};
const path='/bills/'+bill+'/versions/'+version;
test('literal search has exact Unicode source offsets, hashes and canonical version links',()=>{
 const report=findExactPublishedText({pack:pack(),query:'access'});
 assert.equal(report.results.length,2);
 assert.equal(report.results[0].versionId,version);assert.equal(report.stored,false);
 for(const hit of report.results){
  const src=pack().provisions.find(x=>x.id===hit.provisionId);
  assert.equal(Array.from(src.text).slice(hit.start,hit.end).join(''),hit.quote);
  assert.equal(hit.quoteSha256,sha(hit.quote));assert(hit.href.startsWith(path+'#provision-'));
 }
 const emoji=findExactPublishedText({pack:pack(),query:'😃 grants'});
 assert.equal(emoji.results[0].quote,'😃 grants');assert(Object.isFrozen(report.results));
});
test('private, incomplete, tampered sources and unsafe queries never render',()=>{
 for(const changed of [{publication:'private'},{sourceComplete:false},{canonicalSha256:sha('not source')}])
  assert.throws(()=>findExactPublishedText({pack:{...pack(),...changed},query:'ACCESS'}),ReaderSearchError);
 for(const q of ['','x',' ACCESS ','a\nb','x'.repeat(81),null])
  assert.throws(()=>findExactPublishedText({pack:pack(),query:q}),ReaderSearchError);
});
test('results are accessible text, escaped, capped and contain no executable content',()=>{
 const report=findExactPublishedText({pack:pack(),query:'Access',limit:1});
 assert.equal(report.truncated,true);
 assert.match(renderSourceSearchResults(report),/Additional matches/);
 assert.match(renderSourceSearchResults(findExactPublishedText({pack:pack(),query:'unfindable'})),/No matching passage/);
 const p=pack();p.provisions[0].text='<img src=x onerror=alert(1)> ACCESS';
 p.provisions[0].sha256=sha(p.provisions[0].text);p.canonicalSha256=sha(p.provisions.map(x=>x.text).join('\n\n'));
 const html=renderSourceSearchResults(findExactPublishedText({pack:p,query:'ACCESS'}));
 assert(!html.includes('<img src=x'));assert(html.includes('&lt;img'));
});
test('localhost HTTP read-only search works without JavaScript; unrelated query URLs fail',async()=>{
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>pack()});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const page=await fetch(url+path),html=await page.text();
  assert.match(html,/role="search"/);
  assert.match(page.headers.get('content-security-policy'),/form-action 'self'/);
  assert.match(page.headers.get('content-security-policy'),/script-src 'none'/);
  const found=await fetch(url+path+'/search?q=Access');
  assert.equal(found.status,200);assert.match(await found.text(),/Part &lt;one&gt;/);
  assert.equal(found.headers.get('cache-control'),'no-store');
  for(const bad of [path+'?q=Access',path+'/search?q=x',path+'/search?q=Access&private=1',path+'/search?q=%FF'])
   assert.equal((await fetch(url+bad)).status,404);
  assert.equal((await fetch(url+path+'/search?q=Access',{method:'POST'})).status,405);
 }finally{await new Promise(ok=>server.close(ok));}
});
test('cross-publisher active source mismatch remains a 404 with no private error',async()=>{
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>({...pack(),publisherId:'44444444-4444-4444-8444-444444444444'})});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{const r=await fetch('http://127.0.0.1:'+server.address().port+path+'/search?q=Access');
 assert.equal(r.status,404);assert.equal(await r.text(),'Not found');}
 finally{await new Promise(ok=>server.close(ok));}
});
