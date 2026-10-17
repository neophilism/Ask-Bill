import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSourceOnlyShare,renderSourceShareHtml,renderSourceShareText,SourceShareError} from '../packages/export/index.mjs';
import {createPublishedSourceServer} from '../apps/web/source-only/server.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex');
const pub='11111111-1111-4111-8111-111111111111',bill='22222222-2222-4222-8222-222222222222',v='33333333-3333-4333-8333-333333333333',src='Do not apply this draft 😃 to a personal case. <script>unsafe</script>';
function pack(){return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId:pub,billId:bill,versionId:v,title:'A Proposed <Bill>',jurisdiction:'US',language:'en-US',status:'introduced',publication:'published',sourceComplete:true,retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',sourceUrl:'https://www.congress.gov/bill/119th-congress/house-bill/1',canonicalSha256:sha(src),provisions:[{id:'sec-1',heading:'Section & 1',text:src,sha256:sha(src)}]};}
const page='/bills/'+bill+'/versions/'+v;
test('a public share contains exactly source text, immutable digest and no conversation fields',()=>{
 const s=createSourceOnlyShare({pack:pack(),provisionId:'sec-1'});
 assert.equal(s.quoteSha256,sha(src));assert.equal(s.versionId,v);
 assert.equal(s.containsPrivateChat,false);assert.equal(s.containsUserData,false);
 assert.equal(s.sourceLink,page+'#provision-sec-1');
 assert(Object.isFrozen(s));assert.equal(s.status,'introduced');
 const txt=renderSourceShareText(s);assert(txt.includes(src));assert(txt.includes(sha(src)));
 const html=renderSourceShareHtml(s);assert(!html.includes('<script>unsafe</script>'));
 assert(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));
 assert(html.includes('not confirmation of current law'));
});
test('private, incomplete, tampered, and absent provision releases fail closed',()=>{
 for(const values of [{sourceComplete:false},{publication:'private'},{canonicalSha256:sha('wrong')}])
  assert.throws(()=>createSourceOnlyShare({pack:{...pack(),...values},provisionId:'sec-1'}),SourceShareError);
 for(const section of ['sec-9','../secret','<script>',''])
  assert.throws(()=>createSourceOnlyShare({pack:pack(),provisionId:section}),SourceShareError);
 assert.throws(()=>renderSourceShareHtml({kind:'ask-bill-source-share-v1',containsPrivateChat:true}),SourceShareError);
});
test('native full-source page links to safe versioned share and plain-text export',async()=>{
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>pack()});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  const whole=await (await fetch(url+page)).text();
  assert.match(whole,/Share exact source/);
  const link=page+'/share?section=sec-1';
  const shared=await fetch(url+link);
  assert.equal(shared.status,200);
  assert.equal(shared.headers.get('cache-control'),'no-store');
  assert.match(shared.headers.get('content-security-policy'),/script-src 'none'/);
  assert((await shared.text()).includes('&lt;script&gt;unsafe&lt;/script&gt;'));
  const txt=await fetch(url+page+'/share.txt?section=sec-1');
  assert.equal(txt.status,200);assert.match(txt.headers.get('content-type'),/text\/plain/);
  assert((await txt.text()).includes(src));
  for(const bad of ['/share?section=../secret','/share?section=sec-1&extra=1','/share?section=%2Fetc'])
   assert.equal((await fetch(url+page+bad)).status,404);
  assert.equal((await fetch(url+link,{method:'POST'})).status,405);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('source mismatch and wrong publisher do not reveal private release',async()=>{
 const server=await createPublishedSourceServer({publisherId:pub,lookupPublishedPack:async()=>({...pack(),publisherId:'44444444-4444-4444-8444-444444444444'})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+page+'/share?section=sec-1');
 assert.equal(response.status,404);assert.equal(await response.text(),'Not found');}
 finally{await new Promise(resolve=>server.close(resolve));}
});
