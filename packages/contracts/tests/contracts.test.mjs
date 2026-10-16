import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ContractError, parseSourceVersion,parseSourceSpan,verifySourceSpan,parseClaim,parseValidatedSegment,verifyValidatedSegment,parseSemanticCue,parseAnswerEvent,AnswerStreamGuard,parsePublisherRole,rolePermits,parseCharacterManifest} from '../dist/index.js';
const digest = text => createHash('sha256').update(text).digest('hex');
const H = digest('fixed');
const ISO = '2026-10-16T21:07:51Z';
const version={id:'v1',billId:'bill-one',publisherId:'owner',language:'en-US',status:'introduced',rawByteHash:H,canonicalTextHash:H,canonicalizationVersion:'canon-v1',sourceUrl:'https://www.congress.gov/bill/119th-congress/house-bill/1',retrievedAt:ISO,sourceComplete:true,publication:'reviewed'};
const text='A 😃 bill protects access; see section 2.';
const cp=Array.from(text),start=cp.indexOf('😃'),end=start+2;
const quote=cp.slice(start,end).join('');
const span={sourceVersionId:'v1',provisionId:'section-1',start,end,quote,quoteHash:digest(quote),citationLabel:'Section 1',originalLocator:{xmlId:'sec1'}};
const claim={id:'claim1',kind:'bill_text',text:'The phrase is present.',support:'supported',spans:[span],qualifications:[]};
const segment={id:'seg1',text:claim.text,claimIds:['claim1'],claims:[claim],versionId:'v1',validation:{schema:'v1',retrievalConfig:H,promptConfig:H,validatorConfig:H,validatedAt:ISO}};
const common={schemaVersion:1,answerId:'answer1',sequence:1,conversationEpoch:2,documentVersion:'v1',createdAt:ISO};
const mutate=(value,fn)=>{const out=structuredClone(value);fn(out);return out;};
const bad=fn=>assert.throws(fn,ContractError);
test('valid source version is immutable; unknown and incomplete published versions fail',()=>{
  assert.equal(parseSourceVersion(version).id,'v1');
  assert(Object.isFrozen(parseSourceVersion(version)));
  bad(()=>parseSourceVersion({...version,publication:'published',publishedAt:ISO,sourceComplete:false}));
  bad(()=>parseSourceVersion({...version,sourceUrl:'javascript:alert(1)'}));
  bad(()=>parseSourceVersion({...version,retrievedAt:'2026-02-31T21:07:51Z'}));
  bad(()=>parseSourceVersion({...version,extra:'malicious'}));
  bad(()=>parseSourceVersion({...version,rawByteHash:'oops'}));
});
test('exact Unicode code point span and SHA256 verification, including adversarial failures',async()=>{
  assert.equal((await verifySourceSpan(span,{versionId:'v1',provisionId:'section-1',text})).quote,quote);
  await assert.rejects(()=>verifySourceSpan({...span,start:start+1},{versionId:'v1',provisionId:'section-1',text}),ContractError);
  await assert.rejects(()=>verifySourceSpan({...span,quoteHash:H},{versionId:'v1',provisionId:'section-1',text}),ContractError);
  await assert.rejects(()=>verifySourceSpan({...span,sourceVersionId:'v2'},{versionId:'v1',provisionId:'section-1',text}),ContractError);
  await assert.rejects(()=>verifySourceSpan(span,{versionId:'v1',provisionId:'section-2',text}),ContractError);
  bad(()=>parseSourceSpan({...span,start:-1}));
  bad(()=>parseSourceSpan({...span,originalLocator:{xmlId:'sec1',javascript:'alert(1)'}}));
});
test('claim kind and source support constraints fail closed',()=>{
  assert.equal(parseClaim(claim,'v1').spans.length,1);
  bad(()=>parseClaim({...claim,spans:[]},'v1'));
  bad(()=>parseClaim({...claim,kind:'current_law'},'v1'));
  bad(()=>parseClaim({...claim,kind:'prediction'},'v1'));
  bad(()=>parseClaim({...claim,kind:'attributed_position'},'v1'));
  bad(()=>parseClaim({...claim,kind:'unknown'},'v1'));
  bad(()=>parseClaim({...claim,spans:[{...span,sourceVersionId:'v2'}]},'v1'));
  bad(()=>parseClaim({...claim,uncitedModelKey:'injection'},'v1'));
});
test('validated segments bind their claim IDs, version and source metadata',()=>{
  assert.equal(parseValidatedSegment(segment,'v1').id,'seg1');
  bad(()=>parseValidatedSegment(segment,'v2'));
  bad(()=>parseValidatedSegment({...segment,claimIds:['claim2']},'v1'));
  bad(()=>parseValidatedSegment({...segment,validation:{...segment.validation,promptConfig:'bad'}},'v1'));
  bad(()=>parseValidatedSegment({...segment,claims:[]},'v1'));
});
test('grounding verification requires exact provision text for every claim',async()=>{
  assert.equal((await verifyValidatedSegment(segment,'v1',key=>key==='section-1'?text:undefined)).id,'seg1');
  await assert.rejects(()=>verifyValidatedSegment(segment,'v1',()=>undefined),ContractError);
  await assert.rejects(()=>verifyValidatedSegment(segment,'v1',()=>text.replace('😃','🤖')),ContractError);
});
test('performance cues cannot invent coordinates, targets or citation indices',()=>{
  assert.equal(parseSemanticCue({type:'reference',segmentId:'seg1',claimId:'claim1',spanIndex:0},segment).spanIndex,0);
  bad(()=>parseSemanticCue({type:'reference',segmentId:'seg1',claimId:'claim1',spanIndex:1},segment));
  bad(()=>parseSemanticCue({type:'reference',segmentId:'seg1',claimId:'claim1',spanIndex:0,x:10},segment));
  bad(()=>parseSemanticCue({type:'walk',segmentId:'seg1'}));
  bad(()=>parseSemanticCue({type:'acknowledge',segmentId:'seg1',claimId:'claim1'}));
  bad(()=>parseSemanticCue({type:'emphasize',segmentId:'seg1',claimId:'unknown'},segment));
});
test('SSE event payload schemas, version/epoch and replay are enforced',()=>{
  const mk=(sequence,type,data={})=>({...common,sequence,type,...data});
  const guard=new AnswerStreamGuard('answer1','v1',2);
  bad(()=>guard.accept(mk(2,'segment.validated',{segment})));
  guard.accept(mk(0,'answer.started'));
  bad(()=>guard.accept(mk(1,'performance.cue',{cue:{type:'reference',segmentId:'seg1',claimId:'claim1',spanIndex:0}})));
  guard.accept(mk(1,'segment.validated',{segment}));
  bad(()=>guard.accept(mk(1,'segment.validated',{segment})));
  bad(()=>guard.accept({...mk(2,'answer.completed'),documentVersion:'v2'}));
  bad(()=>guard.accept({...mk(2,'answer.completed'),conversationEpoch:3}));
  bad(()=>guard.accept(mk(2,'performance.cue',{cue:{type:'reference',segmentId:'seg1',claimId:'claim1',spanIndex:12}})));
  guard.accept(mk(2,'performance.cue',{cue:{type:'reference',segmentId:'seg1',claimId:'claim1',spanIndex:0}}));
  bad(()=>parseAnswerEvent(mk(3,'performance.cue',{cue:undefined})));
  bad(()=>parseAnswerEvent(mk(3,'answer.completed',{code:'unwanted'})));
  bad(()=>parseAnswerEvent({...mk(3,'answer.completed'),schemaVersion:2}));
  guard.accept(mk(3,'answer.completed'));
  bad(()=>guard.accept(mk(4,'speech.ready',{audioId:'a',segmentId:'seg1'})));
});
test('publisher role contract requires MFA for privileged operations',()=>{
  assert.equal(parsePublisherRole('viewer'),'viewer');
  assert.equal(rolePermits('editor','publish',false),false);
  assert.equal(rolePermits('editor','publish',true),true);
  assert.equal(rolePermits('editor','invite',true),false);
  assert.equal(rolePermits('owner','invite',true),true);
  assert.equal(rolePermits('viewer','view',false),true);
  bad(()=>parsePublisherRole('superadmin'));
  bad(()=>rolePermits('owner','publish','true'));
});
test('character manifest must contain safe URLs and named clips',()=>{
  const manifest={assetVersion:'v1',sourceBlenderHash:H,toolchainHash:H,compatibility:{minContractVersion:1,maxContractVersion:1},lods:[{name:'low',uri:'/assets/bill-v1.glb',hash:H,transferBytes:1000,triangles:500,materialCount:1}],clips:['Idle','WalkFunny','Talk','Wave','Point','Laugh','Celebrate'].map(name=>({name,duration:1,loop:true,contacts:[]})),morphs:['blinkLeft','smile','viseme_A'],mouthMappingVersion:'v1',poster:{uri:'/assets/bill-v1.webp',hash:H},provenanceFile:'/assets/provenance-v1.json'};
  assert.equal(parseCharacterManifest(manifest).clips.length,7);
  bad(()=>parseCharacterManifest(mutate(manifest,x=>{x.clips=x.clips.slice(1)})));
  bad(()=>parseCharacterManifest(mutate(manifest,x=>{x.clips[1].loop=false})));
  bad(()=>parseCharacterManifest(mutate(manifest,x=>{x.lods[0].uri='https://evil.example/bill.glb'})));
  bad(()=>parseCharacterManifest(mutate(manifest,x=>{x.lods[0].uri='/assets/../evil.glb'})));
});
test('short generated malicious values never bypass source/cue version invariants',()=>{
  const inputs=['',null,[],{},'<script>alert(1)</script>','v2','\u0000',1,NaN,{},true];
  for(const value of inputs){bad(()=>parseSemanticCue({type:value,segmentId:'seg1'}));bad(()=>parseSourceSpan({...span,sourceVersionId:value},'v1'));}
});
