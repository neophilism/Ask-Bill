import test from 'node:test';import assert from 'node:assert/strict';
import {createPerformanceDirector,PerformanceError} from '../packages/character/performance/director.mjs';
const bad=code=>e=>e instanceof PerformanceError&&e.code===code;
const scope={answerId:'answer-1',versionId:'v1',conversationEpoch:1};
const evt=(sequence,type,more={})=>({...scope,documentVersion:'v1',sequence,type,...more});
const s={id:'seg-1',versionId:'v1',validation:{schema:'v1'},claims:[{id:'claim-1',kind:'bill_text',support:'supported',spans:[{sourceVersionId:'v1',provisionId:'sec-1'}]}]};
const ref={type:'reference',segmentId:'seg-1',claimId:'claim-1',spanIndex:0};
const make=()=>{const actions=[];const d=createPerformanceDirector({resolveTarget:async({versionId,provisionId})=>({versionId,provisionId,visible:true,safe:true}),onAction:x=>actions.push(x)});d.begin(scope);return {d,actions};};
test('source-grounded semantic cues point only to registered verified provision IDs',async()=>{
 const {d,actions}=make();await d.consume(evt(0,'answer.started'));
 await d.consume(evt(1,'segment.validated',{segment:s}));
 await d.consume(evt(2,'performance.cue',{cue:ref}));
 assert(actions.some(a=>a.kind==='point'&&a.provisionId==='sec-1'));
 assert.equal(d.snapshot().state,'explaining');
 assert(actions.every(x=>!('x' in x)&&!('y' in x)&&!('selector' in x)));
});
test('offscreen or unsafe target falls back to source preview without scrolling',async()=>{
 const actions=[];const d=createPerformanceDirector({resolveTarget:async()=>({versionId:'v1',provisionId:'sec-1',visible:false,safe:false}),onAction:x=>actions.push(x)});
 d.begin(scope);await d.consume(evt(0,'answer.started'));await d.consume(evt(1,'segment.validated',{segment:s}));
 await d.consume(evt(2,'performance.cue',{cue:ref}));
 assert.equal(actions.at(-1).kind,'source-preview');assert.equal(d.snapshot().state,'docked');
});
test('manual pointer/keyboard/selection and reduced motion immediately dock character',async()=>{
 for(const cause of ['pointer','keyboard','selection','focus','scroll','speech','question']){
  const {d,actions}=make();d.activity(cause);assert.equal(d.snapshot().state,'docked');assert.equal(actions.at(-1).reason,'user-'+cause);
 }
 const {d,actions}=make();d.setPreferences({reducedMotion:true});
 await d.consume(evt(0,'answer.started'));await d.consume(evt(1,'segment.validated',{segment:s}));
 await d.consume(evt(2,'performance.cue',{cue:ref}));
 assert(actions.some(x=>x.reason==='motion-disabled'));
 assert(!actions.some(x=>x.kind==='point'));
});
test('hidden and paused state preempt gestures and prevent movement on source cues',async()=>{
 const {d,actions}=make();d.setPreferences({hidden:true,paused:true});
 assert.equal(d.snapshot().state,'hidden');
 await d.consume(evt(0,'answer.started'));await d.consume(evt(1,'segment.validated',{segment:s}));
 await d.consume(evt(2,'performance.cue',{cue:{type:'acknowledge',segmentId:'seg-1'}}));
 assert(!actions.some(x=>x.kind==='gesture'));
 d.setPreferences({hidden:false});assert.equal(d.snapshot().state,'paused');
 d.setPreferences({paused:false});assert.equal(d.snapshot().state,'docked');
});
test('late asynchronous navigation after new answer or user activity is fenced',async()=>{
 let finish;const waiting=new Promise(r=>finish=r);const actions=[];
 const d=createPerformanceDirector({resolveTarget:()=>waiting,onAction:a=>actions.push(a)});
 d.begin(scope);await d.consume(evt(0,'answer.started'));await d.consume(evt(1,'segment.validated',{segment:s}));
 const pending=d.consume(evt(2,'performance.cue',{cue:ref}));
 d.begin({...scope,answerId:'answer-2',conversationEpoch:2});
 finish({visible:true,safe:true,provisionId:'sec-1',versionId:'v1'});await pending;
 assert(!actions.some(x=>x.kind==='point'));
 assert.equal(d.snapshot().answerId,'answer-2');
});
test('model-injected pixel coordinates and unapproved clips are refused',async()=>{
 const {d}=make();await d.consume(evt(0,'answer.started'));await d.consume(evt(1,'segment.validated',{segment:s}));
 for(const cue of [{...ref,x:42},{...ref,selector:'body'},{...ref,spanIndex:2},
    {type:'dance',segmentId:'seg-1',claimId:'claim-1'},
    {type:'emphasize',segmentId:'seg-1',claimId:'wrong'}])
   {const before=d.snapshot().sequence;
    await assert.rejects(d.consume(evt(before,'performance.cue',{cue})),PerformanceError);
    assert.equal(d.snapshot().sequence,before,'invalid event must not consume stream sequence');}
});
test('sequence and conversation epoch replay cannot revive stale motion',async()=>{
 const {d}=make();await d.consume(evt(0,'answer.started'));
 await assert.rejects(d.consume(evt(0,'segment.validated',{segment:s})),bad('STALE_OR_REPLAYED_EVENT'));
 await assert.rejects(d.consume({...evt(1,'segment.validated',{segment:s}),conversationEpoch:2}),bad('STALE_OR_REPLAYED_EVENT'));
 await d.consume(evt(1,'segment.validated',{segment:s}));
 await d.consume(evt(2,'answer.cancelled'));
 await assert.rejects(d.consume(evt(3,'performance.cue',{cue:ref})),bad('ANSWER_ALREADY_FINISHED'));
 assert.throws(()=>d.begin({...scope,conversationEpoch:1}),bad('ANSWER_SCOPE_INVALID'));
});
test('quiet acknowledgement, emphasis and uncertainty use only allowlisted clips',async()=>{
 const {d,actions}=make();await d.consume(evt(0,'answer.started'));await d.consume(evt(1,'segment.validated',{segment:s}));
 await d.consume(evt(2,'performance.cue',{cue:{type:'acknowledge',segmentId:'seg-1'}}));
 await d.consume(evt(3,'performance.cue',{cue:{type:'emphasize',segmentId:'seg-1',claimId:'claim-1'}}));
 await d.consume(evt(4,'performance.cue',{cue:{type:'uncertain',segmentId:'seg-1',claimId:'claim-1'}}));
 assert.deepEqual(actions.filter(x=>x.kind==='gesture').map(x=>x.animation),['Nod','Explain','Shrug']);
});
test('fault in UI callback is contained and never steals reading input',async()=>{
 const d=createPerformanceDirector({resolveTarget:async()=>null,onAction:()=>{throw Error('GPU_LOST')}});
 d.begin(scope);await d.consume(evt(0,'answer.started'));assert.equal(d.snapshot().state,'thinking');
 d.setPreferences({paused:true});assert.equal(d.snapshot().state,'paused');
});
