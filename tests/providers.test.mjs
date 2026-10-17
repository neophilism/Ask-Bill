import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFixtureStructuredProvider,createResponsesProvider,ProviderError} from '../packages/providers/index.mjs';
const a='11111111-1111-4111-8111-111111111111',v='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
const question='What does this section say?',text='An application may be filed at the designated intake.';
const sha=t=>createHash('sha256').update(t).digest('hex');
const route={status:'allowed',notLegalAdvice:true,sourcePublished:true,noModelToolExecution:true,allowedVersionIds:[v],versionId:v,publisherId:a,
 allowedReadTools:['read_selected_version'],questionSha256:sha(question),category:'bill_explanation'};
const bundle={publisherId:a,versionId:v,isPublished:true,sources:[{provisionId:'sec-1',versionId:v,text,sha256:sha(text)}]};
const req=(overrides={})=>({route,question,bundle,...overrides});
const success=(candidate={text:'The source says this sentence.',claims:[]})=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',
 content:[{type:'output_text',text:JSON.stringify(candidate)}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
const configured=(fetchImpl)=>createResponsesProvider({apiKey:'test_only_server_secret_123456',model:'fixture-model-1',enabled:true,dataProtectionVerified:true,fetchImpl});
test('fake provider is reproducible, abortable and explicitly untrusted',async()=>{
 const fake=createFixtureStructuredProvider(),r=await fake.generate(req());
 assert.equal(r.type,'untrusted_draft');assert.equal(r.noCitationAuthority,true);
 assert.equal(r.provider,'ask-bill-fixture');assert.equal(r.claims[0].sourceSha256,sha(text));
 assert.equal(fake.capabilities().externalTools,false);
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>fake.generate(req({signal:controller.signal})),e=>e.code==='REQUEST_ABORTED');
});
test('unsafe route, wrong tenant/version, private source and forged source digest block model',async()=>{
 const fake=createFixtureStructuredProvider();
 for(const x of [req({route:{...route,status:'curated_only'}}),req({route:{...route,sourcePublished:false}}),
 req({bundle:{...bundle,versionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}}),
 req({bundle:{...bundle,sources:[{...bundle.sources[0],sha256:'f'.repeat(64)}]}}),
 req({question:question+' malicious extra text'})]){
  await assert.rejects(()=>fake.generate(x),ProviderError);
 }
 await assert.rejects(()=>fake.generate(req({route:{...route,category:'current_law'}})),e=>e.code==='CURRENT_LAW_EVIDENCE_REQUIRED');
});
test('live provider requires explicit opt in, key, model and verified data protection',()=>{
 assert.throws(()=>createResponsesProvider({}),e=>e.code==='LIVE_PROVIDER_DISABLED');
 assert.throws(()=>createResponsesProvider({enabled:true,apiKey:'valid_test_key_000',model:'safe-model'}),e=>e.code==='PROVIDER_DATA_PROTECTION_REQUIRED');
 assert.throws(()=>createResponsesProvider({enabled:true,dataProtectionVerified:true,apiKey:'bad',model:'safe-model'}),e=>e.code==='LIVE_CREDENTIAL_MISSING');
 assert.throws(()=>createResponsesProvider({enabled:true,dataProtectionVerified:true,apiKey:'valid_test_key_000',model:'../unsafe'}),e=>e.code==='PROVIDER_CONFIG');
});
test('approved opt-in provider uses only fixed HTTPS Responses endpoint and does not store tools or expose key',async()=>{
 let recorded;
 const provider=configured(async(url,opts)=>{recorded={url,opts};return success({text:'Draft claim',claims:[{kind:'bill_text',sourceId:'sec-1'}]});});
 const answer=await provider.generate(req());
 assert.equal(answer.noCitationAuthority,true);assert.equal(answer.verificationRequired,true);assert.equal(answer.text,'Draft claim');
 assert.equal(recorded.url,'https://api.openai.com/v1/responses');assert(!recorded.url.includes('test_only_server_secret'));
 const payload=JSON.parse(recorded.opts.body);
 assert.equal(payload.store,false);assert.deepEqual(payload.tools,[]);assert.equal(payload.stream,false);
 assert.equal(payload.model,'fixture-model-1');assert.equal(recorded.opts.redirect,'manual');
 assert.equal(recorded.opts.headers.Authorization,'Bearer test_only_server_secret_123456');
 assert.equal(provider.capabilities().cancellation,true);
});
test('provider cancellation is checked even when upstream ignores AbortSignal',async()=>{
 const controller=new AbortController();
 const provider=configured(async()=>{controller.abort();return success();});
 await assert.rejects(()=>provider.generate(req({signal:controller.signal})),e=>e.code==='REQUEST_ABORTED');
});
test('failure, incomplete output and invalid JSON are normalized without raw remote error contents',async()=>{
 for(const [response,code] of [
  [new Response('upstream secret stacktrace',{status:429}),'PROVIDER_RATE_LIMITED'],
  [new Response('not JSON',{status:200}),'PROVIDER_JSON_INVALID'],
  [new Response(JSON.stringify({status:'incomplete',output:[]}),{status:200}),'PROVIDER_INCOMPLETE'],
  [success({text:1,claims:[]}), 'PROVIDER_OUTPUT_INVALID']]){
  const provider=configured(async()=>response);
  await assert.rejects(()=>provider.generate(req()),e=>e.code===code&&!e.message.includes('secret'));
 }
});
test('response size budget prevents expensive output parsing',async()=>{
 const large=new Response('X'.repeat(10000),{status:200});
 const provider=createResponsesProvider({enabled:true,dataProtectionVerified:true,apiKey:'test_only_server_secret_123456',
  model:'fixture-model',maxOutputBytes:1000,fetchImpl:async()=>large});
 await assert.rejects(()=>provider.generate(req()),e=>e.code==='PROVIDER_SIZE_LIMIT');
});
test('curated child or personal sources never reach upstream, even if live adapter is enabled',async()=>{
 let called=0;const provider=configured(async()=>{called++;return success()});
 await assert.rejects(()=>provider.generate(req({route:{...route,status:'source_only'}})),ProviderError);
 await assert.rejects(()=>provider.generate(req({route:{...route,status:'curated_only'}})),ProviderError);
 assert.equal(called,0);
});
