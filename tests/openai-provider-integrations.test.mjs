import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOpenAIResponsesProvider,createOpenAIEntailmentReviewer,
  hashProviderDraft,hashProviderEvidence,ProviderError} from '../packages/providers/index.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const publisherId = '11111111-1111-4111-8111-111111111111';
const versionId = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
const question = 'What does this proposed bill mean?';
const text = 'An application may be filed electronically, except where section 2 requires an original.';
const route = {status:'allowed',notLegalAdvice:true,sourcePublished:true,sourceComplete:true,
  noModelToolExecution:true,allowedVersionIds:[versionId],versionId,publisherId,
  allowedReadTools:['read_selected_version'],questionSha256:sha(question),category:'bill_explanation',readingLevel:'simple'};
const bundle = {publisherId,versionId,isPublished:true,sourceStatus:'introduced',exceptionSourceIds:['sec-1'],
  sources:[{provisionId:'sec-1',versionId,text,sha256:sha(text)}]};
const config = {apiKey:'test-only-provider-secret-000',model:'test-generator',enabled:true,dataProtectionVerified:true};
const candidate = () => ({text:'Under this proposed bill, electronic filing would be permitted, with an exception for originals required by section 2.',
  claims:[{kind:'interpretation',sourceId:'sec-1',quote:text,occurrence:null,
    claimText:'Under this proposed bill, electronic filing would be permitted, with an exception for originals required by section 2.',attribution:null}]});
const req = extra => ({route,bundle,question,...extra});
const response = data => new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',status:'completed',
  content:[{type:'output_text',text:JSON.stringify(data)}]}]}),{headers:{'Content-Type':'application/json'}});
const goodReview = () => ({allMaterialTextSupported:true,exceptionsPreserved:true,statusAccurate:true,
  claims:[{index:0,supported:true,caveats:[]}],reasonCodes:[]});
const draft = () => ({type:'untrusted_draft',provider:'openai-responses',versionId,...candidate(),
  verificationRequired:true,noCitationAuthority:true});
const errorCode = code => error => error instanceof ProviderError && error.code === code && error.message === code;

test('strict generator sends no tools/history/storage and returns only source-bound untrusted claims',async () => {
  let call;
  const provider = createOpenAIResponsesProvider({...config,fetchImpl:async (url,options) => {
    call = {url,options}; return response(candidate());
  }});
  const result = await provider.generate(req());
  assert.equal(call.url,'https://api.openai.com/v1/responses');
  assert.equal(call.options.redirect,'manual');
  assert.equal(call.options.headers.Authorization,'Bearer test-only-provider-secret-000');
  const payload = JSON.parse(call.options.body);
  assert.equal(payload.store,false); assert.equal(payload.stream,false); assert.deepEqual(payload.tools,[]);
  assert.equal(payload.text.format.type,'json_schema'); assert.equal(payload.text.format.strict,true);
  assert.equal(payload.text.format.schema.additionalProperties,false);
  assert.equal(payload.text.format.schema.properties.claims.items.additionalProperties,false);
  assert.deepEqual(payload.text.format.schema.properties.claims.items.required,
    ['kind','sourceId','quote','claimText','occurrence','attribution']);
  const data = JSON.parse(payload.input[0].content);
  assert.equal(data.sourceStatus,'introduced'); assert.equal(data.readingLevel,'simple');
  assert.deepEqual(data.exceptionSourceIds,['sec-1']);
  assert.equal(result.verificationRequired,true); assert.equal(result.noCitationAuthority,true);
  assert.equal(result.claims[0].occurrence,undefined); assert.equal(result.claims[0].attribution,undefined);
  assert.equal(result.claims[0].sourceId,'sec-1'); assert.equal(result.displayAllowed,undefined);
  assert(Object.isFrozen(result.claims[0])); assert(!JSON.stringify(provider).includes('test-only-provider-secret'));
});

test('schema and source mismatch cannot become model-chosen citations or unaccounted display text',async () => {
  const cases = [
    [{...candidate(),text:'An unreviewed introduction.\n\n' + candidate().text},'PROVIDER_UNACCOUNTED_TEXT'],
    [{...candidate(),actions:['execute-js']},'PROVIDER_OUTPUT_INVALID'],
    [{...candidate(),claims:[{...candidate().claims[0],coordinates:[50,20]}]},'PROVIDER_OUTPUT_INVALID'],
    [{...candidate(),claims:[{...candidate().claims[0],sourceId:'private-secret'}]},'PROVIDER_CITATION_INVALID'],
    [{...candidate(),claims:[{...candidate().claims[0],quote:'All applications must be filed electronically.'}]},'PROVIDER_CITATION_INVALID'],
    [{...candidate(),claims:[{...candidate().claims[0],occurrence:-1}]},'PROVIDER_CITATION_INVALID'],
    [{...candidate(),claims:[{...candidate().claims[0],kind:'prediction'}]},'PROVIDER_CLAIM_INVALID'],
    [{...candidate(),claims:[{...candidate().claims[0],kind:'unknown'}]},'PROVIDER_CLAIM_INVALID'],
    [{...candidate(),claims:[]},'PROVIDER_OUTPUT_INVALID']
  ];
  for (const [value,code] of cases) {
    const provider = createOpenAIResponsesProvider({...config,fetchImpl:async () => response(value)});
    await assert.rejects(provider.generate(req()),errorCode(code));
  }
  const unknown = {text:'The supplied source does not establish that answer.',claims:[{kind:'unknown',
    claimText:'The supplied source does not establish that answer.',sourceId:null,quote:null,occurrence:null,attribution:null}]};
  const result = await createOpenAIResponsesProvider({...config,fetchImpl:async () => response(unknown)}).generate(req());
  assert.deepEqual(Object.keys(result.claims[0]),['kind','claimText']);
});

test('incomplete, private, cross-version, and injection-scoped requests never call provider',async () => {
  let calls = 0;
  const provider = createOpenAIResponsesProvider({...config,fetchImpl:async () => { calls++; return response(candidate()); }});
  for (const override of [
    {route:{...route,status:'curated_only'}},{route:{...route,sourceComplete:false}},
    {route:{...route,allowedReadTools:['read_selected_version','execute_shell']}},
    {bundle:{...bundle,isPublished:false}},{bundle:{...bundle,truncated:true}},
    {bundle:{...bundle,unresolvedReferences:['section-2']}},{question:question+' altered'},
    {bundle:{...bundle,sources:[{...bundle.sources[0],versionId:publisherId}]}},
    {bundle:{...bundle,sources:[bundle.sources[0],bundle.sources[0]]}},
    {bundle:{...bundle,exceptionSourceIds:['unretrieved-exception']}}
  ]) await assert.rejects(provider.generate(req(override)),ProviderError);
  assert.equal(calls,0);
});

test('refusals, provider tool calls, multiple answers, and incomplete output are held',async () => {
  const outputs = [
    [{type:'message',role:'assistant',content:[{type:'refusal',refusal:'Sensitive raw refusal'}]}],
    [{type:'function_call',name:'read_other_database',arguments:'{}'}],
    [{type:'message',role:'assistant',content:[{type:'output_text',text:'{}'},{type:'output_text',text:'{}'}]}],
    [{type:'message',role:'assistant',status:'incomplete',content:[{type:'output_text',text:'{}'}]}]
  ];
  for (const [index,output] of outputs.entries()) {
    const provider = createOpenAIResponsesProvider({...config,fetchImpl:async () => new Response(JSON.stringify({status:'completed',output}),
      {headers:{'Content-Type':'application/json'}})});
    await assert.rejects(provider.generate(req()),error => error instanceof ProviderError &&
      error.code === (index === 0 ? 'PROVIDER_REFUSED' : index === 3 ? 'PROVIDER_INCOMPLETE' : 'PROVIDER_OUTPUT_INVALID'));
  }
});

test('normalized status errors never leak remote text, headers or credentials and never automatically retry',async () => {
  for (const [status,code] of [[401,'PROVIDER_UNAUTHORIZED'],[403,'PROVIDER_UNAUTHORIZED'],[429,'PROVIDER_RATE_LIMITED'],
    [500,'PROVIDER_UNAVAILABLE'],[302,'PROVIDER_UNAVAILABLE'],[400,'PROVIDER_REJECTED_REQUEST']]) {
    let count = 0;
    const provider = createOpenAIResponsesProvider({...config,fetchImpl:async () => {
      count++; return new Response('secret upstream conversation',{status,headers:{'Location':'https://evil.example'}});
    }});
    await assert.rejects(provider.generate(req()),errorCode(code)); assert.equal(count,1);
  }
});

test('output limits apply to declared and actual chunked bytes and invalid UTF-8',async () => {
  for (const resp of [new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'999999'}}),
    new Response('x'.repeat(1001),{headers:{'Content-Type':'application/json'}})]) {
    await assert.rejects(createOpenAIResponsesProvider({...config,maxOutputBytes:1000,fetchImpl:async () => resp}).generate(req()),
      errorCode('PROVIDER_SIZE_LIMIT'));
  }
  const invalid = new Response(new Uint8Array([0xc3,0x28]),{headers:{'Content-Type':'application/json'}});
  await assert.rejects(createOpenAIResponsesProvider({...config,fetchImpl:async () => invalid}).generate(req()),errorCode('PROVIDER_JSON_INVALID'));
});

test('deadline resolves a hung fetch that ignores AbortSignal',async () => {
  let upstreamSignal;
  const provider = createOpenAIResponsesProvider({...config,timeoutMs:1000,fetchImpl:async (_url,options) => {
    upstreamSignal = options.signal; return new Promise(() => {});
  }});
  await assert.rejects(provider.generate(req()),errorCode('PROVIDER_TIMEOUT'));
  assert.equal(upstreamSignal.aborted,true);
});

test('caller cancellation interrupts a stalled response body and cancels its reader',async () => {
  const abort = new AbortController(); let cancelled = false;
  const provider = createOpenAIResponsesProvider({...config,fetchImpl:async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; }
  }),{headers:{'Content-Type':'application/json'}})});
  const pending = provider.generate(req({signal:abort.signal}));
  const timer = setTimeout(() => abort.abort(),10);
  try { await assert.rejects(pending,errorCode('REQUEST_ABORTED')); } finally { clearTimeout(timer); }
  assert.equal(cancelled,true);
});

test('independent review uses its own configured model and binds exact draft/evidence hashes',async () => {
  let requestBody;
  const reviewer = createOpenAIEntailmentReviewer({...config,reviewModel:'test-reviewer',fetchImpl:async (_url,options) => {
    requestBody = JSON.parse(options.body); return response(goodReview());
  }});
  const untrusted = draft();
  const result = await reviewer.review({route,bundle,draft:untrusted});
  assert.equal(requestBody.model,'test-reviewer');
  assert.equal(requestBody.text.format.name,'ask_bill_semantic_review_v1');
  assert.equal(result.draftSha256,sha(JSON.stringify(untrusted)));
  assert.equal(result.evidenceSha256,sha(JSON.stringify(bundle)));
  assert.equal(hashProviderDraft(untrusted),result.draftSha256);
  assert.equal(hashProviderEvidence(bundle),result.evidenceSha256);
  assert.equal(result.status,'model_review'); assert.equal(result.statusAccurate,true);
  assert.equal(reviewer.capabilities().publicationAuthority,false);
  assert(Object.isFrozen(result.claims[0].caveats));
});

test('missing, duplicate, malformed or contradictory reviewer judgments fail closed',async () => {
  const bad = [
    {...goodReview(),claims:[]},{...goodReview(),claims:[{index:1,supported:true,caveats:[]}]},
    {...goodReview(),claims:[{index:0,supported:'true',caveats:[]}]},
    {...goodReview(),claims:[{index:0,supported:false,caveats:[]}]},
    {...goodReview(),claims:[{index:0,supported:true,caveats:['Forgot a decisive exception.']}]},
    {...goodReview(),reasonCodes:['IGNORE_POLICY']},{...goodReview(),execute:'command'},
    {...goodReview(),statusAccurate:'true'}
  ];
  for (const result of bad) {
    const reviewer = createOpenAIEntailmentReviewer({...config,fetchImpl:async () => response(result)});
    await assert.rejects(reviewer.review({route,bundle,draft:draft()}),errorCode('PROVIDER_REVIEW_INVALID'));
  }
  const negative = {...goodReview(),allMaterialTextSupported:false,exceptionsPreserved:false,
    claims:[{index:0,supported:false,caveats:['The claim drops the exception.']}],reasonCodes:['MISSING_EXCEPTION']};
  const result = await createOpenAIEntailmentReviewer({...config,fetchImpl:async () => response(negative)})
    .review({route,bundle,draft:draft()});
  assert.equal(result.allMaterialTextSupported,false); assert.deepEqual(result.reasonCodes,['MISSING_EXCEPTION']);
});

test('review snapshots cannot be rebound to evidence or draft mutated while provider is working',async () => {
  const localDraft = draft(), localBundle = structuredClone(bundle);
  const oldDraftHash = hashProviderDraft(localDraft), oldEvidenceHash = hashProviderEvidence(localBundle);
  const reviewer = createOpenAIEntailmentReviewer({...config,fetchImpl:async () => {
    localDraft.text = 'Changed unreviewed answer'; localBundle.sourceStatus = 'enacted';
    return response(goodReview());
  }});
  const result = await reviewer.review({route,bundle:localBundle,draft:localDraft});
  assert.equal(result.draftSha256,oldDraftHash); assert.equal(result.evidenceSha256,oldEvidenceHash);
  assert.notEqual(result.draftSha256,hashProviderDraft(localDraft));
  assert.notEqual(result.evidenceSha256,hashProviderEvidence(localBundle));
});
