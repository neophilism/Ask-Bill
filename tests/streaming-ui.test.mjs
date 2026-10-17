import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {approveVerbatimSegment,ValidatedAnswerStream} from '../packages/streaming/index.mjs';
import {answerView,CitationCardError} from '../packages/ui/citations/index.mjs';
const hash=t=>createHash('sha256').update(t).digest('hex'),v='v1',text='A proposed bill requires a complete filing.';
const span={sourceVersionId:v,provisionId:'section-1',start:0,end:Array.from(text).length,quote:text,quoteHash:hash(text),citationLabel:'Section 1',originalLocator:{}};
const claim={id:'claim-1',kind:'bill_text',text,support:'qualified',spans:[span],qualifications:['Review required']};
const segment={id:'seg-1',text,versionId:v,claims:[claim],claimIds:['claim-1'],validation:{schema:'v1',retrievalConfig:hash('retrieval'),promptConfig:hash('prompt'),validatorConfig:hash('validator'),validatedAt:'2026-10-16T22:00:00.000Z'}};
const held={status:'awaiting_semantic_review',sourcesVerified:true,displayAllowed:false,documentVersion:v,segment};
const evidence={status:'source_evidence',versionId:v,included:[{provisionId:'section-1',versionId:v,text,sha256:hash(text)}],exceptionMarkers:[],unresolvedReferences:[],truncated:false};
const lookup=async id=>id==='section-1'?{versionId:v,text,sha256:hash(text),publication:'published',sourceComplete:true}:undefined;
test('independent review, private SSE emitter and reader revalidate the same exact source',async()=>{
 const s=new ValidatedAnswerStream({answerId:'ans1',versionId:v,epoch:0});const ctx={versionId:v,epoch:0};
 const events=[s.emit('answer.started',{},ctx)];
 const approval=await approveVerbatimSegment({held,evidence});
 events.push(s.emit('segment.validated',{approval},ctx),s.emit('citation.ready',{span},ctx),s.emit('answer.completed',{},ctx));
 const viewed=await answerView({events,versionId:v,answerId:'ans1',epoch:0,sourceLookup:lookup});
 assert.equal(viewed.length,1);assert.equal(viewed[0].citations[0].quote,text);
 await assert.rejects(()=>answerView({events,versionId:v,answerId:'ans1',epoch:1,sourceLookup:lookup}),CitationCardError);
 await assert.rejects(()=>answerView({events,versionId:v,answerId:'ans1',epoch:0,sourceLookup:async()=>({...await lookup('section-1'),publication:'private'})}),CitationCardError);
});
test('a forged citation-ready envelope cannot alter the quote hash or offsets',async()=>{
 const s=new ValidatedAnswerStream({answerId:'ans1',versionId:v,epoch:0});const ctx={versionId:v,epoch:0};
 const events=[s.emit('answer.started',{},ctx),s.emit('segment.validated',{approval:await approveVerbatimSegment({held,evidence})},ctx)];
 const tampered={schemaVersion:1,answerId:'ans1',documentVersion:v,conversationEpoch:0,createdAt:'2026-10-16T22:00:00.000Z',sequence:2,type:'citation.ready',span:{...span,quoteHash:hash('wrong')}};
 await assert.rejects(()=>answerView({events:[...events,tampered],versionId:v,answerId:'ans1',epoch:0,sourceLookup:lookup}),CitationCardError);
});
