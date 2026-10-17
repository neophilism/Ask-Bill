import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateClaimDraft} from '../packages/grounding/claims/index.mjs';
import {evaluateLiteralSupport,EntailmentError} from '../packages/grounding/entailment/index.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),pub='11111111-1111-4111-8111-111111111111',
 v='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',pid='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
 source='The statutory excerpt provides electronic filing. Except during a network outage, receipt occurs at intake.';
const route={status:'allowed',sourcePublished:true,noModelToolExecution:true,publisherId:pub,versionId:v};
const evidence={status:'source_evidence',versionId:v,publisherId:pub,configSha256:sha('retrieval'),
 included:[{provisionId:pid,versionId:v,text:source,sha256:sha(source)}],exceptionMarkers:[],unresolvedReferences:[],truncated:false};
async function heldFor({quote=source,text=source,claimText=quote,claimKind='bill_text',evidenceInput=evidence}={}){
 return validateClaimDraft({route,evidence:evidenceInput,draft:{type:'untrusted_draft',noCitationAuthority:true,verificationRequired:true,
  versionId:v,text,claims:[{kind:claimKind,sourceId:pid,quote,claimText}]},
 validatedAt:'2026-10-16T23:00:00.000Z',promptConfigSha256:sha('prompt')});
}
test('verbatim exact source can be exposed only as labeled quotation, never legal interpretation',async()=>{
 const h=await heldFor();const r=await evaluateLiteralSupport({held:h,evidence});
 assert.equal(r.status,'verified_verbatim_source_only');assert.equal(r.displayAllowed,true);assert.equal(r.spokenAllowed,false);
 assert.equal(r.semanticEntailmentVerified,true);assert.equal(r.supportsLegalInterpretation,false);
 assert.equal(r.requiresStatusLabel,true);assert.equal(r.segment.claims[0].support,'supported');
 assert(Object.isFrozen(r.segment.claims));assert(Object.isFrozen(r.segment.claims[0]));
});
test('conversational paraphrase cannot become a supported legal claim without independent checking',async()=>{
 const h=await heldFor({quote:'electronic filing',claimText:'electronic filing',text:'Electronic filing is always legally binding.'});
 const r=await evaluateLiteralSupport({held:h,evidence});
 assert.equal(r.status,'needs_semantic_review');assert.equal(r.reason,'UNREVIEWED_PARAPHRASE');assert.equal(r.displayAllowed,false);
});
test('decisive exception cannot be omitted from a displayed literal answer',async()=>{
 const e={...evidence,exceptionMarkers:[{sourceId:pid,needsReview:true}]};
 const h=await heldFor({quote:'receipt occurs at intake.',text:'receipt occurs at intake.',claimText:'receipt occurs at intake.',evidenceInput:e});
 const r=await evaluateLiteralSupport({held:h,evidence:e});
 assert.equal(r.status,'needs_semantic_review');assert.equal(r.reason,'DECISIVE_EXCEPTION_NOT_CITED');
 const whole=await heldFor({evidenceInput:e});const permitted=await evaluateLiteralSupport({held:whole,evidence:e});
 assert.equal(permitted.displayAllowed,true);assert.equal(permitted.segment.claims[0].spans[0].quote,source);
});
test('unresolved cross-references or a truncated corpus keep answer display disabled',async()=>{
 const h=await heldFor();
 let r=await evaluateLiteralSupport({held:h,evidence:{...evidence,truncated:true}});
 assert.equal(r.reason,'EVIDENCE_TRUNCATED');assert.equal(r.spokenAllowed,false);
 r=await evaluateLiteralSupport({held:h,evidence:{...evidence,unresolvedReferences:[{from:pid,citedSection:'900'}]}});
 assert.equal(r.reason,'UNRESOLVED_REFERENCES');
});
test('bad source hashes and tampered citations fail before any promotion',async()=>{
 const h=await heldFor();
 await assert.rejects(()=>evaluateLiteralSupport({held:h,evidence:{...evidence,included:[{...evidence.included[0],sha256:'f'.repeat(64)}]}}),e=>e.code==='SOURCE_INTEGRITY');
 const copy=structuredClone(h);copy.segment.claims[0].spans[0].quoteHash='f'.repeat(64);
 const r=await evaluateLiteralSupport({held:copy,evidence});
 assert.equal(r.reason,'TAMPERED_CITATION');assert.equal(r.displayAllowed,false);
});
test('unknown and hypothetical claims do not turn into supported literal law',async()=>{
 for(const kind of ['interpretation','hypothetical']){
  const h=await heldFor({claimKind:kind});
  const r=await evaluateLiteralSupport({held:h,evidence});
  assert.equal(r.status,'needs_semantic_review');assert.equal(r.reason,'MATERIAL_INTERPRETATION_REQUIRED');
 }
});
test('different version and already visible unreviewed drafts cannot bypass the gate',async()=>{
 const h=await heldFor();
 await assert.rejects(()=>evaluateLiteralSupport({held:{...h,displayAllowed:true},evidence}),EntailmentError);
 await assert.rejects(()=>evaluateLiteralSupport({held:h,evidence:{...evidence,versionId:'different'}}),EntailmentError);
});
