import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateClaimDraft,ClaimGateError} from '../packages/grounding/claims/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex'),pub='11111111-1111-4111-8111-111111111111',
 version='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',pid='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const text='Section 1: 😃 receipt occurs when a submission enters intake. Except as section 3 provides.';
const query='When is receipt?',route={status:'allowed',sourcePublished:true,noModelToolExecution:true,publisherId:pub,versionId:version,questionSha256:sha(query)};
const evidence={status:'source_evidence',publisherId:pub,versionId:version,configSha256:sha('retrieval-config'),
 included:[{provisionId:pid,versionId:version,text,sha256:sha(text)}],exceptionMarkers:[],unresolvedReferences:[],truncated:false};
const candidate={type:'untrusted_draft',provider:'fixture',noCitationAuthority:true,verificationRequired:true,
 versionId:version,text:'The source discusses receipt timing.',claims:[{kind:'bill_text',sourceId:pid,quote:'😃 receipt',
  claimText:'The bill uses the phrase receipt.'}]};
const run=overrides=>validateClaimDraft({route,evidence,draft:candidate,validatedAt:'2026-10-16T22:00:00.000Z',promptConfigSha256:sha('prompt'),...overrides});
test('constructs exact source-verifiable quote spans but withholds unreviewed semantics',async()=>{
 const r=await run();
 assert.equal(r.status,'awaiting_semantic_review');assert.equal(r.sourcesVerified,true);
 assert.equal(r.semanticEntailmentVerified,false);assert.equal(r.displayAllowed,false);assert.equal(r.spokenAllowed,false);
 const c=r.segment.claims[0],span=c.spans[0];
 assert.equal(c.support,'qualified');assert.equal(span.sourceVersionId,version);assert.equal(span.provisionId,pid);
 assert.equal(Array.from(text).slice(span.start,span.end).join(''),span.quote);
 assert.equal(span.quoteHash,sha(span.quote));assert(Object.isFrozen(span));assert(Object.isFrozen(c));
});
test('fake citations, tampered source hashes and other publisher versions fail closed',async()=>{
 for(const changed of [{...candidate,claims:[{...candidate.claims[0],quote:'never appeared'}]},
  {...candidate,claims:[{...candidate.claims[0],sourceId:'unrecognized'}]},
  {...candidate,claims:[{...candidate.claims[0],quoteHash:'f'.repeat(64)}]},
  {...candidate,versionId:'different'}]){
  await assert.rejects(()=>run({draft:changed}),ClaimGateError);
 }
 await assert.rejects(()=>run({evidence:{...evidence,included:[{...evidence.included[0],text:'altered'}]}}),e=>e.code==='EVIDENCE_TAMPERED');
 await assert.rejects(()=>run({route:{...route,publisherId:'22222222-2222-4222-8222-222222222222'}}),e=>e.code==='UNAPPROVED_EVIDENCE');
});
test('source quote occurrence must be explicit when words repeat',async()=>{
 const repeated='Clause: clause and clause.';
 const e={...evidence,included:[{...evidence.included[0],text:repeated,sha256:sha(repeated)}]};
 const d={...candidate,claims:[{kind:'bill_text',sourceId:pid,quote:'clause',claimText:'The phrase is repeated.'}]};
 await assert.rejects(()=>run({evidence:e,draft:d}),e=>e.code==='SOURCE_QUOTE_NOT_EXACT');
 const r=await run({evidence:e,draft:{...d,claims:[{...d.claims[0],occurrence:1}]}});
 assert.equal(r.segment.claims[0].spans[0].quote,'clause');
});
test('unknown answers carry no fabricated source and cannot be presented before review',async()=>{
 const d={...candidate,claims:[{kind:'unknown',claimText:'The excerpt does not answer this.'}]};
 const r=await run({draft:d});
 assert.equal(r.segment.claims[0].kind,'unknown');assert.equal(r.segment.claims[0].spans.length,0);
 assert.equal(r.segment.claims[0].support,'unavailable');assert.equal(r.displayAllowed,false);
 await assert.rejects(()=>run({draft:{...d,claims:[{...d.claims[0],quote:'pretend'}]}}),e=>e.code==='UNKNOWN_HAS_CITATION');
});
test('unsupported current-law claims and predictions are never accepted as bill facts',async()=>{
 for(const kind of ['current_law','prediction']){
  await assert.rejects(()=>run({draft:{...candidate,claims:[{...candidate.claims[0],kind}]}}),e=>e.code==='CLAIM_SCHEMA');
 }
});
test('model text that contradicts cited source never gains a validated support label',async()=>{
 const d={...candidate,text:'The bill was enacted with immediate effect.',claims:[{...candidate.claims[0],claimText:'The bill was enacted with immediate effect.'}]};
 const r=await run({draft:d});
 assert.equal(r.segment.claims[0].support,'qualified');assert.equal(r.semanticEntailmentVerified,false);assert.equal(r.displayAllowed,false);
});
test('ambiguous exception and truncated retrieval remain explicit support-review blockers',async()=>{
 const e={...evidence,exceptionMarkers:[{sourceId:pid,needsReview:true}],truncated:true,unresolvedReferences:[{from:pid}]};
 const r=await run({evidence:e});
 assert.equal(r.exceptionReviewRequired,true);assert.equal(r.displayAllowed,false);
});
test('child-only routes, private previews and invalid time/source metadata are denied',async()=>{
 for(const r of [{...route,status:'curated_only'},{...route,sourcePublished:false}]){
  await assert.rejects(()=>run({route:r}),e=>e.code==='UNAPPROVED_EVIDENCE');
 }
 await assert.rejects(()=>run({validatedAt:'not-a-time'}),e=>e.code==='VALIDATION_METADATA');
 await assert.rejects(()=>run({promptConfigSha256:'bogus'}),e=>e.code==='VALIDATION_METADATA');
});
