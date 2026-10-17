import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validatePublishedReaderPack,renderPublishedReader,renderPublishedPlainText,publicBillLink,createPublicReader,PublicReaderError} from '../packages/ui/reader/index.mjs';
const sha=t=>createHash('sha256').update(t,'utf8').digest('hex');
const pub='11111111-1111-4111-8111-111111111111',bill='22222222-2222-4222-8222-222222222222',version='33333333-3333-4333-8333-333333333333';
const text=['A proposed rule 😃 would require recorded receipt.','Exception: this draft excludes diplomatic applications.'];
function pack(changes={}){
 const provisions=text.map((s,i)=>({id:'sec-'+(i+1),heading:i===0?'Section <1>':'Exception & exceptions',text:s,sha256:sha(s)}));
 return {schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',
  publisherId:pub,billId:bill,versionId:version,title:'A Proposed <Bill>',
  language:'en-US',jurisdiction:'United States',status:'introduced',publication:'published',sourceComplete:true,
  retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',
  sourceUrl:'https://www.congress.gov/bill/119th-congress/house-bill/1',
  canonicalSha256:sha(provisions.map(x=>x.text).join('\n\n')),provisions,...changes};
}
test('complete published sources show exact version and remain usable without JavaScript',()=>{
 const html=renderPublishedReader(pack());
 assert.match(html,/Skip to legislation/);assert.match(html,/aria-label="Sections"/);
 assert.match(html,/Section &lt;1&gt;/);assert.match(html,/Proposed &lt;Bill&gt;/);
 assert.match(html,/provision-sec-2/);assert.match(html,/proposed rule 😃/);
 assert.match(html,/not verified as currently effective law/);assert.match(html,/Official source/);
 assert(!html.includes('<Bill>'));
 assert.equal(publicBillLink({billId:bill,versionId:version,provisionId:'sec-1'}),'/bills/'+bill+'/versions/'+version+'#provision-sec-1');
 assert(Object.isFrozen(validatePublishedReaderPack(pack()).provisions));
});
test('incomplete, private, tampered and unsafe source packs fail closed',()=>{
 const valid=pack();
 for(const changed of [{publication:'reviewed'},{sourceComplete:false},{canonicalSha256:sha('wrong')},
   {provisions:[{...valid.provisions[0],text:'changed'},valid.provisions[1]]},
   {status:'current_law'},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://evil.example/bill'},
   {publishedAt:'2026-10-16T18:00:00Z'}, {language:'en" onload=alert(1)'}])
   assert.throws(()=>renderPublishedReader(pack(changed)),PublicReaderError);
 assert.throws(()=>renderPublishedReader(pack({provisions:[valid.provisions[0],valid.provisions[0]]})),PublicReaderError);
});
test('legal markup stays escaped and plain text preserves exact source',()=>{
 const injection='<script>alert("x")</script>\nA & exception';
 const original=pack(),provisions=[{...original.provisions[0],text:injection,sha256:sha(injection)},original.provisions[1]];
 const changed=pack({provisions,canonicalSha256:sha(provisions.map(p=>p.text).join('\n\n'))});
 const html=renderPublishedReader(changed);
 assert.match(html,/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
 assert(!html.includes('<script>'));
 const plain=renderPublishedPlainText(changed);
 assert(plain.includes(injection));assert(!plain.includes('<html>'));
});
test('trusted server lookup binds publisher, bill and version without leaking private errors',async()=>{
 const calls=[];
 const reader=createPublicReader({lookupPublishedPack:async ids=>{calls.push(ids);return pack();}});
 const page=await reader.read({publisherId:pub,billId:bill,versionId:version});
 assert.match(page,/source-only reading/);assert.equal(calls.length,1);assert(Object.isFrozen(calls[0]));
 assert.match(await reader.read({publisherId:pub,billId:bill,versionId:version,format:'text'}),/Not legal advice/);
 await assert.rejects(()=>reader.read({publisherId:pub,billId:bill,versionId:'00000000-0000-4000-8000-000000000000'}),e=>e.code==='PUBLIC_RELEASE_UNAVAILABLE');
 const missing=createPublicReader({lookupPublishedPack:async()=>{throw new Error('private credential value')}});
 await assert.rejects(()=>missing.read({publisherId:pub,billId:bill,versionId:version}),e=>e.code==='PUBLIC_RELEASE_UNAVAILABLE'&&!e.message.includes('credential'));
});
test('publication does not assert current legal effectiveness',()=>{
 for(const s of ['draft','introduced','enacted','repealed','unknown'])assert.match(renderPublishedReader(pack({status:s})),/not verified as currently effective law/);
 assert.match(renderPublishedReader(pack({status:'effective'})),/Verify the current legal status/);
});
