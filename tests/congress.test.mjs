import test from 'node:test';
import assert from 'node:assert/strict';
import {createCongressClient,congressBillIdentity,CongressError} from '../packages/content/connectors/congress/index.mjs';
const id={congress:119,billType:'hr',billNumber:1},key='TEST_KEY_NEVER_COMMITTED';
const now=Date.parse('2026-10-16T21:00:00Z');
const make=(body,{status=200,headers={}}={})=>new Response(status===304?null:JSON.stringify(body),{status,headers});
test('bill identifier is structural and no free-form paths can be injected',()=>{
 assert.equal(congressBillIdentity(id).key,'119hr1');
 for(const invalid of [{...id,billType:'../api'},{...id,billNumber:'1'}, {...id,congress:-1}]){
  assert.throws(()=>congressBillIdentity(invalid),CongressError);
 }
});
test('server-only API key is sent as a header and bill status is not invented',async()=>{
 const calls=[];
 const client=createCongressClient({apiKey:key,clock:()=>now,fetchImpl:async (url,options)=>{
  calls.push({url,options});return make({bill:{congress:119,type:'H.R.',number:1,title:'Example Bill',latestAction:{actionDate:'2026-10-14',text:'Introduced'}}},{headers:{ETag:'"rev1"'}});
 }});
 const r=await client.bill(id);
 assert.equal(r.lawStatus,'unknown');assert.equal(r.effectiveAt,null);assert.equal(r.title,'Example Bill');
 assert.equal(r.etag,'"rev1"');assert.equal(r.retrievedAt,'2026-10-16T21:00:00.000Z');
 assert.equal(calls[0].options.headers['X-Api-Key'],key);assert(!calls[0].url.includes(key));
 assert.equal(calls[0].options.redirect,'manual');
});
test('official text versions bind exact formats and maintain immutable source keys',async()=>{
 const url='https://www.congress.gov/119/bills/hr1/BILLS-119hr1ih.xml';
 const client=createCongressClient({apiKey:key,clock:()=>now,fetchImpl:async()=>make({textVersions:[{date:'2025-01-01T00:00:00Z',type:'Introduced in House',formats:[{url,type:'Formatted XML'},{url:'https://www.congress.gov/119/bills/hr1/BILLS-119hr1ih.htm',type:'Formatted Text'}]}],pagination:{count:1}})});
 const a=await client.textVersions(id),b=await client.textVersions(id);
 assert.equal(a.versions.length,1);assert.deepEqual(a.versions,b.versions);
 assert.equal(a.versions[0].formats[0].type,'Formatted XML');
 assert.equal(a.versions[0].sourceKey.length,64);
});
test('malicious off-origin text links, HTML embeds and external redirects fail closed',async()=>{
 for(const url of ['https://evil.test/119/bills/hr1/malware.xml','http://www.congress.gov/119/bills/hr1/file.xml','https://www.congress.gov/119/bills/hr2/file.xml','https://www.congress.gov/119/bills/hr1/file.js','https://www.congress.gov/119/bills/hr1/file.xml?url=evil']){
  const c=createCongressClient({apiKey:key,fetchImpl:async()=>make({textVersions:[{date:'2025-01-01',type:'Draft',formats:[{type:'PDF',url}]}]})});
  await assert.rejects(()=>c.textVersions(id),e=>e.code==='TEXT_FORMAT_URL');
 }
 const redirect=createCongressClient({apiKey:key,fetchImpl:async()=>new Response(null,{status:302,headers:{Location:'https://evil.test'}})});
 await assert.rejects(()=>redirect.bill(id),e=>e.code==='SOURCE_REDIRECT_BLOCKED');
});
test('ETag revalidation and bounded explicit 429 retries',async()=>{
 let count=0;const sleeps=[],headers=[];
 const c=createCongressClient({apiKey:key,sleep:async n=>{sleeps.push(n)},fetchImpl:async(_url,opt)=>{
  headers.push(opt.headers);
  if(++count===1)return make(null,{status:429,headers:{'Retry-After':'1'}});
  return new Response(null,{status:304});
 }});
 const r=await c.bill(id,{etag:'"rev1"'});
 assert.equal(r.notModified,true);assert.equal(r.etag,'"rev1"');assert.deepEqual(sleeps,[1000]);assert.equal(headers[1]['If-None-Match'],'"rev1"');
});
test('bounded size, invalid JSON, wrong bill IDs and missing keys are rejected',async()=>{
 assert.throws(()=>createCongressClient({apiKey:''}),e=>e.code==='API_KEY_MISSING');
 const badJson=createCongressClient({apiKey:key,fetchImpl:async()=>new Response('{', {status:200})});
 await assert.rejects(()=>badJson.bill(id),e=>e.code==='SOURCE_JSON_INVALID');
 const mismatch=createCongressClient({apiKey:key,fetchImpl:async()=>make({bill:{congress:120,number:1,type:'HR'}})});
 await assert.rejects(()=>mismatch.bill(id),e=>e.code==='BILL_RESPONSE_MISMATCH');
 const huge=createCongressClient({apiKey:key,fetchImpl:async()=>new Response('x'.repeat(4*1024*1024+1),{status:200})});
 await assert.rejects(()=>huge.bill(id),e=>e.code==='SOURCE_RESPONSE_LIMIT');
});
test('client-side safety quotas and version list pagination cannot run without bounds',async()=>{
 let calls=0,clock=now;
 const c=createCongressClient({apiKey:key,quotaPerHour:1,clock:()=>clock,fetchImpl:async()=>{calls++;return make({bill:{congress:119,number:1,type:'HR'}})}});
 await c.bill(id);await assert.rejects(()=>c.bill(id),e=>e.code==='LOCAL_RATE_LIMIT');
 clock+=3600001;await c.bill(id);assert.equal(calls,2);
});
