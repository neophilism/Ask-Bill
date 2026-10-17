import test from 'node:test';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {approveVerbatimSegment,ValidatedAnswerStream,StreamError,encodeSse} from '../packages/streaming/index.mjs';
const h=t=>createHash('sha256').update(t).digest('hex'),text='The proposed section requires electronic filing.',v='v1';
const span={sourceVersionId:v,provisionId:'p1',start:0,end:Array.from(text).length,quote:text,quoteHash:h(text),citationLabel:'Section 1',originalLocator:{}};
const claim={id:'c1',kind:'bill_text',text,support:'qualified',spans:[span],qualifications:['Review needed']};
const seg={id:'seg1',text,versionId:v,claims:[claim],claimIds:['c1'],validation:{schema:'v1',retrievalConfig:h('retrieval'),promptConfig:h('prompt'),validatorConfig:h('validator'),validatedAt:'2026-10-16T22:00:00.000Z'}};
const held={status:'awaiting_semantic_review',sourcesVerified:true,displayAllowed:false,documentVersion:v,segment:seg};
const evidence={status:'source_evidence',versionId:v,publisherId:'pub',configSha256:h('retrieval'),included:[{provisionId:'p1',versionId:v,text,sha256:h(text)}],exceptionMarkers:[],unresolvedReferences:[],truncated:false};
const ctx={epoch:2,versionId:v};const make=()=>new ValidatedAnswerStream({answerId:'a1',versionId:v,epoch:2,maxReplay:3});const approve=()=>approveVerbatimSegment({held,evidence});
test('self-asserted approval, raw tokens and unknown fields fail closed',async()=>{
 const q=make();q.emit('answer.started',{},ctx);
 for(const payload of [{segment:seg,approved:true},{approval:{segment:seg,versionId:v}},{approved:true},{approval:await approve(),type:'answer.completed'}]){
  assert.throws(()=>q.emit('segment.validated',payload,ctx),StreamError);
 }
 assert.throws(()=>q.emit('answer.started',{text:'model tokens'},ctx),StreamError);
 assert.throws(()=>q.emit('speech.ready',{},ctx),StreamError);
});
test('independently approved verbatim segment gets one-use, schema-bound emission',async()=>{
 const q=make();q.emit('answer.started',{},ctx);const approval=await approve();const e=q.emit('segment.validated',{approval},ctx);
 assert.equal(e.segment.claims[0].support,'supported');assert.equal(e.approved,undefined);
 assert.match(encodeSse(e),/event: segment.validated/);
 assert.throws(()=>encodeSse({...e}),StreamError);
 assert.throws(()=>q.emit('segment.validated',{approval},ctx),StreamError);
});
test('paraphrase, tampered source and unreviewed exception never receive a grant',async()=>{
 await assert.rejects(()=>approveVerbatimSegment({held:{...held,documentVersion:'v2'},evidence}),StreamError);
 await assert.rejects(()=>approveVerbatimSegment({held:{...held,segment:{...seg,text:'Now enacted law!'}},evidence}),StreamError);
 await assert.rejects(()=>approveVerbatimSegment({held,evidence:{...evidence,truncated:true}}),StreamError);
});
test('citation and movement cues require existing validated spans',async()=>{
 const q=make();q.emit('answer.started',{},ctx);
 assert.throws(()=>q.emit('citation.ready',{span},ctx),StreamError);
 q.emit('segment.validated',{approval:await approve()},ctx);
 assert.equal(q.emit('citation.ready',{span},ctx).span.quote,text);
 assert.throws(()=>q.emit('citation.ready',{span:{...span,quote:'forged'}},ctx),StreamError);
 assert.throws(()=>q.emit('performance.cue',{cue:{type:'reference',segmentId:'seg1',claimId:'c1',spanIndex:99}},ctx),StreamError);
 assert.throws(()=>q.emit('performance.cue',{cue:{type:'reference',segmentId:'seg1',claimId:'c1',spanIndex:0,x:9}},ctx),StreamError);
});
test('bounded replay, stale epochs and terminal states remain enforced',async()=>{
 const q=make();q.emit('answer.started',{},ctx);q.emit('segment.validated',{approval:await approve()},ctx);q.emit('citation.ready',{span},ctx);q.emit('answer.completed',{},ctx);
 assert.deepEqual(q.replay(1).map(e=>e.sequence),[2,3]);assert.throws(()=>q.replay(-1),StreamError);
 assert.throws(()=>q.emit('answer.failed',{code:'FAILED',recovery:'Retry'},ctx),StreamError);
 const x=make();x.emit('answer.started',{},ctx);x.cancel();assert.throws(()=>x.emit('answer.completed',{},ctx),StreamError);
});
