import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createJobWorker} from '../packages/jobs/index.mjs';
import {preparePrivatePreview,createPrivateImportHandler,classifyRecoveryAction} from '../packages/content/recovery/index.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const pub='11111111-1111-4111-8111-111111111111',version='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
const jobId='bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',workerId='cccccccc-0000-4000-8000-cccccccccccc';
const bytes=Buffer.from('# Synthetic source\nThe draft uses an electronic intake system.','utf8');
const item={publisherId:pub,versionId:version,publication:'private',sourceComplete:false,expectedRawSha256:hash(bytes),mime:'text/markdown',bytes};
test('source-integrity preflight keeps exact text private and never emits bytes to outbox',async()=>{
 const x=await preparePrivatePreview({item,trustedPublisherId:pub});
 assert.equal(x.status,'quarantined_private_preview');assert.equal(x.metadata.sourceComplete,false);
 assert.equal(x.metadata.publicationAllowed,false);assert.equal(x.metadata.rawSha256,hash(bytes));
 const handler=createPrivateImportHandler({trustedPublisherId:pub,loadQuarantine:async()=>item});
 const e=await handler({jobId,kind:'content.intake',heartbeat:async()=>true});
 assert.equal(e.type,'content.private_preview_ready');assert.equal(e.payload.publicationAllowed,false);
 assert.equal(e.payload.needsManualReview,true);assert(!JSON.stringify(e).includes(bytes.toString()));
});
test('wrong tenant, corrupted source and unsupported executable content dead-letter',async()=>{
 await assert.rejects(()=>preparePrivatePreview({item:{...item,publisherId:'22222222-2222-4222-8222-222222222222'},trustedPublisherId:pub}),e=>e.code==='QUARANTINE_NOT_AUTHORIZED');
 await assert.rejects(()=>preparePrivatePreview({item:{...item,expectedRawSha256:hash('wrong')},trustedPublisherId:pub}),e=>e.code==='SOURCE_BYTES_MISMATCH');
 await assert.rejects(()=>preparePrivatePreview({item:{...item,mime:'application/xml'},trustedPublisherId:pub}),e=>e.code==='QUARANTINE_REJECTED');
 const handler=createPrivateImportHandler({trustedPublisherId:pub,loadQuarantine:async()=>item});
 await assert.rejects(()=>handler({jobId,kind:'content.publish',heartbeat:async()=>true}),e=>e.code==='INTAKE_KIND_FORBIDDEN');
});
test('no stored blob and provider outage retry rather than creating a fake source',async()=>{
 const handler=createPrivateImportHandler({trustedPublisherId:pub,loadQuarantine:async()=>{throw Error('outage')}});
 await assert.rejects(()=>handler({jobId,kind:'content.intake',heartbeat:async()=>true}),e=>e.code==='SOURCE_UNAVAILABLE'&&e.retryable);
 const noLease=createPrivateImportHandler({trustedPublisherId:pub,loadQuarantine:async()=>item});
 await assert.rejects(()=>noLease({jobId,kind:'content.intake',heartbeat:async()=>false}),e=>e.code==='JOB_LEASE_LOST');
});
test('crash/retry through fenced job runner commits just one private outbox item',async()=>{
 let claimed=0,failed=0,committed=0;
 const store={
  async claimJob(){claimed++;return claimed<=2?{jobId,kind:'content.intake',fence:claimed}:null;},
  async heartbeatJob(){return true;},
  async failJob(){failed++;return true;},
  async completeJobAndEnqueue({event}){assert.equal(event.payload.publicationAllowed,false);committed++;return true;}
 };
 let attempted=0;
 const handler=createPrivateImportHandler({trustedPublisherId:pub,loadQuarantine:async()=>{attempted++;if(attempted===1)throw Error('temporary outage');return item;}});
 const worker=createJobWorker({store,publisherId:pub,workerId,handleJob:handler});
 assert.equal((await worker.runOnce()).status,'retry');
 assert.equal((await worker.runOnce()).status,'completed');
 assert.equal((await worker.runOnce()).status,'idle');
 assert.equal(failed,1);assert.equal(committed,1);
});
test('recovery states never reactivate withdrawn, corrupted or unreviewed releases',()=>{
 assert.deepEqual(classifyRecoveryAction('withdrawn'),{action:'keep_withdrawn',safeToPublish:false});
 assert.equal(classifyRecoveryAction('last_published').action,'serve_immutable_previous_release');
 assert.equal(classifyRecoveryAction('dead-letter').safeToPublish,false);
 assert.equal(classifyRecoveryAction('retry').safeToPublish,false);
 assert.throws(()=>classifyRecoveryAction('publish_now'));
});
