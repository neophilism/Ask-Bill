import test from 'node:test';import assert from 'node:assert/strict';
import {createConversationEpochCoordinator,ConversationEpochError} from '../packages/voice/interruption/epochs.mjs';
function ports(broken){const calls=[];const p={};for(const n of ['generation','audio','captions','motion','microphone'])p[n]={cancel(scope){calls.push({name:n,scope});if(n===broken)throw Error('PRIVATE_ERROR');}};return {calls,p};}
const event=(ctx,type,sequence)=>({versionId:ctx.versionId,conversationEpoch:ctx.conversationEpoch,answerId:ctx.answerId,type,sequence});
test('new question atomically cancels all prior activity before accepting events',()=>{
 const x=ports(),c=createConversationEpochCoordinator({versionId:'v1',ports:x.p});const s=c.beginAnswer({answerId:'q1'});
 assert.equal(s.accepted,true);assert.equal(s.conversationEpoch,1);assert.equal(x.calls.length,5);
 assert(x.calls.every(x=>x.scope.reason==='NEW_QUESTION'));
 assert.equal(c.snapshot().retainedQuestions,0);
});
test('old SSE answer event cannot reanimate stale speech after next question',()=>{
 const c=createConversationEpochCoordinator({versionId:'v1'}),first=c.beginAnswer({answerId:'q1'});
 assert.equal(c.offerEvent(event(first,'answer.started',0)).accepted,true);
 const next=c.beginAnswer({answerId:'q2'});
 assert.equal(c.offerEvent(event(first,'segment.validated',1)).accepted,false);
 assert.equal(c.offerEvent(event(next,'answer.started',0)).accepted,true);
});
test('event order and answer start are strict; invalid inputs do not advance sequence',()=>{
 const c=createConversationEpochCoordinator({versionId:'v1'}),scope=c.beginAnswer({answerId:'q'});
 assert.equal(c.offerEvent(event(scope,'segment.validated',0)).accepted,false);
 assert.equal(c.offerEvent({...event(scope,'answer.started',0),versionId:'wrong'}).accepted,false);
 assert.equal(c.snapshot().expectedSequence,0);
 assert.equal(c.offerEvent(event(scope,'answer.started',0)).accepted,true);
 assert.equal(c.offerEvent(event(scope,'answer.started',1)).accepted,false);
 assert.equal(c.offerEvent(event(scope,'segment.validated',2)).accepted,false);
 assert.equal(c.snapshot().expectedSequence,1);
 assert.equal(c.offerEvent(event(scope,'segment.validated',1)).requiresIndependentSourceValidation,true);
});
test('completion and cancellation events seal the answer scope',()=>{
 const c=createConversationEpochCoordinator({versionId:'v1'}),s=c.beginAnswer({answerId:'ans'});
 c.offerEvent(event(s,'answer.started',0));c.offerEvent(event(s,'answer.completed',1));
 assert.equal(c.snapshot().state,'finished');assert.equal(c.offerEvent(event(s,'citation.ready',2)).accepted,false);
});
test('document switch invalidates old events and async operations',()=>{
 const c=createConversationEpochCoordinator({versionId:'v1'}),s=c.beginAnswer({answerId:'q'});
 const changed=c.switchVersion({versionId:'v2'});
 assert.equal(changed.versionId,'v2');assert.equal(changed.state,'idle');
 assert.equal(c.offerEvent(event(s,'answer.started',0)).accepted,false);
 assert.throws(()=>c.beginAnswer({answerId:'../bad'}),ConversationEpochError);
});
test('old generation and late TTS promises never trigger new answer gestures',async()=>{
 const c=createConversationEpochCoordinator({versionId:'v1'});c.beginAnswer({answerId:'a1'});
 let resolve,applied=0;const operation=new Promise(r=>{resolve=r});
 const promise=c.guardCompletion({operation,label:'audio',apply(){applied++}});
 c.beginAnswer({answerId:'a2'});resolve('late voice');
 assert.deepEqual(await promise,{applied:false,reason:'STALE_COMPLETION'});assert.equal(applied,0);
});
test('current async completions can apply exactly once, not across cancelled state',async()=>{
 const c=createConversationEpochCoordinator({versionId:'v1'});c.beginAnswer({answerId:'a1'});
 let count=0;const done=await c.guardCompletion({operation:Promise.resolve('ok'),label:'captions',apply(value){assert.equal(value,'ok');count++;}});
 assert.equal(done.applied,true);assert.equal(count,1);
 c.stop();await assert.rejects(c.guardCompletion({operation:Promise.resolve(1),label:'audio',apply(){}}),ConversationEpochError);
});
test('port exceptions do not stop cancellation of other ports, and fail closed',()=>{
 const x=ports('audio'),c=createConversationEpochCoordinator({versionId:'v1',ports:x.p});
 const r=c.beginAnswer({answerId:'q'});assert.equal(r.accepted,false);assert.equal(r.state,'paused');
 assert.equal(r.faulted,true);assert.equal(x.calls.length,5);
 assert.equal(c.offerEvent(event(r,'answer.started',0)).accepted,false);
});
test('user stop cancels microphone and animation as well as generation and audio',()=>{
 const x=ports(),c=createConversationEpochCoordinator({versionId:'v1',ports:x.p});c.beginAnswer({answerId:'a'});
 const stop=c.stop();assert.equal(stop.state,'idle');assert.equal(stop.answerId,null);
 assert.equal(x.calls.length,10);assert.deepEqual(x.calls.slice(5).map(x=>x.name),['generation','audio','captions','motion','microphone']);
});
test('dispose is final and validates no plaintext question is exposed in snapshots',()=>{
 const c=createConversationEpochCoordinator({versionId:'v1'});c.beginAnswer({answerId:'a'});
 c.dispose();assert.equal(c.snapshot().state,'disposed');assert.throws(()=>c.beginAnswer({answerId:'b'}),ConversationEpochError);
 const s=JSON.stringify(c.snapshot());assert(!s.includes('transcript'));assert(!s.includes('questionText'));
});
