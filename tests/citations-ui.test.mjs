import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {presentCitation,answerView,citationCardHtml,CitationCardError} from '../packages/ui/citations/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex'),versionId='v1',text='The law 💡 protects readers.';
const span={sourceVersionId:versionId,provisionId:'p1',start:0,end:Array.from(text).length,quote:text,quoteHash:sha(text),citationLabel:'Section <1>',originalLocator:{}};
const claim={id:'c1',kind:'bill_text',text,support:'supported',spans:[span],qualifications:['Exact quotation only']};
const lookup=async id=>id==='p1'?{versionId,text,sha256:sha(text),publication:'published',sourceComplete:true}:undefined;
const validSegment={id:'s1',versionId,text,claimIds:['c1'],claims:[claim],validation:{schema:'v1',retrievalConfig:sha('a'),promptConfig:sha('b'),validatorConfig:sha('c'),validatedAt:'2026-10-16T21:00:00.000Z'}};
const common={schemaVersion:1,answerId:'a1',conversationEpoch:3,documentVersion:versionId,createdAt:'2026-10-16T21:00:00.000Z'};
const events=[{...common,sequence:0,type:'answer.started'},{...common,sequence:1,type:'segment.validated',segment:validSegment},
 {...common,sequence:2,type:'citation.ready',span},{...common,sequence:3,type:'answer.completed'}];
test('Unicode citations require exact quote and source hash before rendering',async()=>{
 const c=await presentCitation({claim,span,versionId,sourceLookup:lookup});
 assert.equal(c.quote,text);assert.match(citationCardHtml(c),/&lt;1&gt;/);
 await assert.rejects(()=>presentCitation({claim,span:{...span,quoteHash:sha('evil')},versionId,sourceLookup:lookup}),CitationCardError);
 await assert.rejects(()=>presentCitation({claim,span,versionId,sourceLookup:async()=>({...await lookup('p1'),sha256:'f'.repeat(64)})}),CitationCardError);
});
test('unpublished, incomplete, wrong-version and missing sources are refused',async()=>{
 const req={claim,span,versionId};
 for(const sourceLookup of [async()=>undefined,async()=>({...await lookup('p1'),sourceComplete:false}),
   async()=>({...await lookup('p1'),publication:'private'}),async()=>({...await lookup('p1'),versionId:'v2'})])
  await assert.rejects(()=>presentCitation({...req,sourceLookup}),CitationCardError);
});
test('whole-answer view validates pinned ordered events and literal source spans',async()=>{
 const view=await answerView({events,versionId,answerId:'a1',epoch:3,sourceLookup:lookup});
 assert.equal(view[0].citations[0].quote,text);assert(Object.isFrozen(view));
 await assert.rejects(()=>answerView({events:[events[0],events[2]],versionId,answerId:'a1',epoch:3,sourceLookup:lookup}),CitationCardError);
 await assert.rejects(()=>answerView({events:[...events.slice(0,1),{...events[1],segment:{...validSegment,text:'Unsupported opinion.'}}],versionId,answerId:'a1',epoch:3,sourceLookup:lookup}),CitationCardError);
 await assert.rejects(()=>answerView({events,versionId:'v2',answerId:'a1',epoch:3,sourceLookup:lookup}),CitationCardError);
});
test('HTML injection is encoded and fabricated answers cannot rely on approved=true',async()=>{
 const c=await presentCitation({claim,span,versionId,sourceLookup:lookup});
 assert.doesNotMatch(citationCardHtml({...c,citationLabel:'<script>alert(1)</script>'}),/<script>/);
 await assert.rejects(()=>answerView({events:[{...common,sequence:0,type:'answer.started',approved:true}],versionId,answerId:'a1',epoch:3,sourceLookup:lookup}),CitationCardError);
 assert.throws(()=>citationCardHtml({...c,sourceAnchor:'javascript:alert(1)'}),CitationCardError);
});
