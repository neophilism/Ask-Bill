import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {approveVerbatimSegment,ValidatedAnswerStream} from '../packages/streaming/index.mjs';
import {createPublicAnswerCache,publicAnswerCacheKey,publicFallback,createProviderCircuit,CacheError} from '../packages/grounding/cache/index.mjs';
const sha=t=>createHash('sha256').update(t).digest('hex');
const v='v1',text='A proposed requirement is recorded in the source.';
const span={sourceVersionId:v,provisionId:'p1',start:0,end:Array.from(text).length,quote:text,quoteHash:sha(text),citationLabel:'Section 1',originalLocator:{}};
const claim={id:'c1',kind:'bill_text',text,support:'qualified',spans:[span],qualifications:['Source review']};
const segment={id:'s1',versionId:v,text,claims:[claim],claimIds:['c1'],validation:{schema:'v1',retrievalConfig:sha('r'),promptConfig:sha('p'),validatorConfig:sha('v'),validatedAt:'2026-10-16T22:00:00.000Z'}};
const held={status:'awaiting_semantic_review',sourcesVerified:true,displayAllowed:false,documentVersion:v,segment};
const evidence={status:'source_evidence',versionId:v,included:[{provisionId:'p1',versionId:v,text,sha256:sha(text)}],exceptionMarkers:[],unresolvedReferences:[],truncated:false};
const route={publisherId:'publisher1',versionId:v,status:'allowed',sourcePublished:true,sourceComplete:true,
 category:'bill_explanation',notLegalAdvice:true,noModelToolExecution:true,allowedVersionIds:[v],questionSha256:sha('question')};
const config={sourceSha256:sha(text),modelSha256:sha('m'),promptSha256:sha('p'),validatorSha256:sha('v'),retrievalSha256:sha('r'),locale:'en-US'};
const approved=async()=>{const st=new ValidatedAnswerStream({answerId:'a1',versionId:v,epoch:0});st.emit('answer.started',{}, {epoch:0,versionId:v});return st.emit('segment.validated',{approval:await approveVerbatimSegment({held,evidence})},{epoch:0,versionId:v});};
test('only genuine source-reviewed event objects may enter a shared cache',async()=>{
 const cache=createPublicAnswerCache();const e=await approved();
 const key=cache.put(route,config,e);assert.equal(key,publicAnswerCacheKey(route,config));
 assert.equal(cache.get(route,config),e);
 assert.throws(()=>cache.put(route,config,{...e}),CacheError);
 assert.throws(()=>cache.put(route,config,{...e,approved:true}),CacheError);
});
test('private, personal, altered versions and validator changes are isolated or rejected',async()=>{
 const cache=createPublicAnswerCache();const e=await approved();cache.put(route,config,e);
 for(const x of [{...route,category:'personal_application'}, {...route,sourcePublished:false},
  {...route,status:'curated_only'}, {...route,sourceComplete:false}])
  assert.throws(()=>cache.get(x,config),CacheError);
 assert.equal(cache.get(route,{...config,validatorSha256:sha('new')}),null);
 assert.equal(cache.get(route,{...config,sourceSha256:sha('changed')}),null);
 assert.equal(cache.get({...route,versionId:'v2',allowedVersionIds:['v2']},config),null);
});
test('cache expiry and purge do not alter independent reading and source pages',async()=>{
 let clock=1000;const cache=createPublicAnswerCache({now:()=>clock,ttlMs:2000});
 cache.put(route,config,await approved());clock+=2001;assert.equal(cache.get(route,config),null);
 cache.put(route,config,await approved());assert.equal(cache.purge(),1);assert.equal(cache.size(),0);
 assert.equal(publicFallback('QUOTA_EXCEEDED').readingEnabled,true);
 assert.equal(publicFallback('PROVIDER_UNAVAILABLE').liveGenerationEnabled,false);
});
test('bounded circuit opens, cools down and supports one half-open probe',()=>{
 let now=1000;const c=createProviderCircuit({now:()=>now,failureThreshold:2,cooldownMs:5000});
 assert.equal(c.canAttempt(),true);c.failure();c.failure();
 assert.equal(c.canAttempt(),false);assert.equal(c.state(),'open');now=7000;
 assert.equal(c.canAttempt(),true);assert.equal(c.state(),'half_open');assert.equal(c.canAttempt(),false);
 c.failure();assert.equal(c.canAttempt(),false);now=12000;
 assert.equal(c.canAttempt(),true);c.success();assert.equal(c.state(),'closed');
 assert.throws(()=>publicFallback('PERSONAL_REQUEST'),CacheError);
});
