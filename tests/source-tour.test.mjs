import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
import {createSourceOnlyTour,renderSourceTourStep,SourceTourError} from '../packages/tours/index.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const pub='11111111-1111-4111-8111-111111111111',bill='22222222-2222-4222-8222-222222222222',version='33333333-3333-4333-8333-333333333333';
const texts=['Draft clause 😃 about receipt and a possible exception.','Exception and citation <script>alert(1)</script>'];
function pack(){const provisions=texts.map((text,i)=>({id:'sec-'+(i+1),heading:i?'Exception & 2':'Section <1>',text,sha256:sha(text)}));return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId:pub,billId:bill,versionId:version,title:'Example Bill <Draft>',jurisdiction:'US',language:'en-US',status:'introduced',publication:'published',sourceComplete:true,retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',canonicalSha256:sha(texts.join('\n\n')),provisions};}
const path='/bills/'+bill+'/versions/'+version;
test('source-only tours pin version, ordered provisions, and hashes with no model or sound',()=>{
 const tour=createSourceOnlyTour({pack:pack()});
 assert.equal(tour.steps.length,2);assert.equal(tour.versionId,version);assert.equal(tour.modelEnabled,false);assert.equal(tour.audioEnabled,false);
 for(const s of tour.steps){const original=pack().provisions.find(x=>x.id===s.provisionId);assert.equal(s.sourceSectionSha256,original.sha256);assert.equal(s.quoteSha256,sha(s.quote));assert(s.sourceLink.startsWith(path+'#'));}
 assert(Object.isFrozen(tour));assert(Object.isFrozen(tour.steps));assert(Object.isFrozen(tour.steps[0]));
});
test('tour render escapes adversarial legal text and exposes no-JS navigation',()=>{
 const tour=createSourceOnlyTour({pack:pack()}),html=renderSourceTourStep({tour,step:2});
 assert(html.includes('Step 2 of 2'));assert(html.includes('Previous passage'));
 assert(html.includes('Leave the tour'));assert(!html.includes('<script>alert(1)</script>'));
 assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.throws(()=>renderSourceTourStep({tour:{...tour},step:1}),SourceTourError);
 for(const step of [-1,0,3,'1'])assert.throws(()=>renderSourceTourStep({tour,step}),SourceTourError);
});
test('incomplete/private/tampered releases do not generate any tour',()=>{
 for(const change of [{publication:'private'},{sourceComplete:false},{canonicalSha256:sha('bad')}])
  assert.throws(()=>createSourceOnlyTour({pack:{...pack(),...change}}),SourceTourError);
 assert.throws(()=>createSourceOnlyTour({pack:pack(),maxSteps:100}),SourceTourError);
 const limited=createSourceOnlyTour({pack:pack(),maxSteps:1});
 assert.equal(limited.tourHasMoreSections,true);
 assert(renderSourceTourStep({tour:limited,step:1}).includes('only part of the document'));
});
test('native source-only localhost tour works without client JS, maintains CSP and version',async()=>{
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>pack()});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const whole=await (await fetch(origin+path)).text();assert(whole.includes('Guided source tour'));
  const response=await fetch(origin+path+'/tour/1');
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-security-policy'),/script-src 'none'/);
  assert.match(await response.text(),/Next passage/);
  for(const bad of ['/tour/0','/tour/3','/tour/2?secret=yes'])
   assert.equal((await fetch(origin+path+bad)).status,404);
  assert.equal((await fetch(origin+path+'/tour/1',{method:'POST'})).status,405);
 }finally{await new Promise(ok=>server.close(ok));}
});
test('tenant mismatches fail closed and never expose the private publication',async()=>{
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>({...pack(),publisherId:'44444444-4444-4444-8444-444444444444'})});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{const res=await fetch('http://127.0.0.1:'+server.address().port+path+'/tour/1');assert.equal(res.status,404);assert.equal(await res.text(),'Not found');}
 finally{await new Promise(ok=>server.close(ok));}
});
