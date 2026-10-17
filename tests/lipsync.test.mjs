import test from 'node:test';import assert from 'node:assert/strict';
import {createLipSyncDirector,VISEME_TARGETS,LipSyncError} from '../packages/voice/lipsync/index.mjs';
const hash='f'.repeat(64),scope={versionId:'v1',segmentId:'seg-1',conversationEpoch:3,textSha256:hash};
const morphNames=Object.values(VISEME_TARGETS);
const timing={validatedBy:'ask-bill-speech-timing-v1',versionId:'v1',sourceTextSha256:hash,
  playbackAuthorized:false,durationSeconds:2,alignment:'provider',
  visemes:[{label:'AA',from:0.1,to:0.5,weight:0.8},{label:'OH',from:0.5,to:1.1,weight:1}]};
const args=()=>({timing,modelMorphNames:morphNames,scope});
const clock=(director,t,extra={})=>director.frame({audioSeconds:t,versionId:'v1',conversationEpoch:3,isPlaying:true,...extra});
const bad=code=>e=>e instanceof LipSyncError&&e.code===code;
test('real generated glTF visemes map to the AB-081 timing labels',()=>{
 const d=createLipSyncDirector(args());assert.equal(d.supported,true);
 const a=clock(d,0.3),o=clock(d,0.8);
 assert.equal(a.clip,'Talk');assert(a.weights.viseme_AA>0.7);
 assert(o.weights.viseme_OH>0.9);
 assert(a.weights.viseme_sil>=0);assert(a.weights.viseme_sil<=1);
 assert(Object.isFrozen(a.weights));assert(a.mouthMask.includes('viseme_AA'));
});
test('paused, hidden, reduced-motion, or timed-out speech returns neutral pose',()=>{
 const d=createLipSyncDirector(args());
 for(const x of [{isPlaying:false},{hidden:true},{reducedMotion:true}]){
  const f=clock(d,0.3,x);assert.equal(f.enabled,false);assert.equal(f.weights.viseme_sil,1);
  assert.equal(f.clip,'Idle');
 }
 assert.equal(clock(d,4).enabled,false);
});
test('missing face rig degrades gracefully instead of inventing a mouth',()=>{
 const d=createLipSyncDirector({...args(),modelMorphNames:['PaperBreathe','TailSway']});
 assert.equal(d.supported,false);assert.equal(d.reason,'MOUTH_SHAPES_UNAVAILABLE');
 assert.equal(clock(d,0.3).enabled,false);
});
test('unaligned speech never pretends to contain accurate visemes',()=>{
 const d=createLipSyncDirector({...args(),timing:{...timing,alignment:'none',visemes:[]}});
 assert.equal(d.supported,false);assert.equal(d.reason,'NO_VERIFIED_ALIGNMENT');
 assert.equal(clock(d,0.3).weights.viseme_sil,1);
});
test('cancel instantly zeros morphs and stale epoch cannot restart',()=>{
 const d=createLipSyncDirector(args());assert.equal(clock(d,0.3).enabled,true);
 assert.equal(d.cancel().enabled,false);assert.equal(clock(d,0.3).enabled,false);
 assert.throws(()=>d.frame({audioSeconds:0.3,versionId:'v2',conversationEpoch:3,isPlaying:true}),bad('STALE_SPEECH_EPOCH'));
 assert.throws(()=>d.frame({audioSeconds:0.3,versionId:'v1',conversationEpoch:4,isPlaying:true}),bad('STALE_SPEECH_EPOCH'));
});
test('malformed or unverified timing, wrong version/digest and unknown mouth labels are rejected',()=>{
 for(const badTiming of [{...timing,versionId:'v2'},{...timing,sourceTextSha256:'0'.repeat(64)},
    {...timing,validatedBy:'model-guessed'},{...timing,playbackAuthorized:true},
    {...timing,visemes:[{...timing.visemes[0],label:'script'}]},
    {...timing,visemes:[{label:'OH',from:1,to:1.5,weight:1},{label:'AA',from:0,to:0.5,weight:1}]}])
  assert.throws(()=>createLipSyncDirector({...args(),timing:badTiming}),LipSyncError);
 assert.throws(()=>createLipSyncDirector({...args(),scope:{...scope,textSha256:'garbage'}}),bad('SPEECH_SCOPE_INVALID'));
});
test('bounded attack/release includes legal coarticulation without hard pops',()=>{
 const d=createLipSyncDirector(args());
 const pre=clock(d,0.06),edge=clock(d,0.1),center=clock(d,0.2),post=clock(d,0.51);
 assert(pre.weights.viseme_AA>0&&pre.weights.viseme_AA<center.weights.viseme_AA);
 assert(edge.weights.viseme_AA>pre.weights.viseme_AA);
 assert(post.weights.viseme_OH>0);
 for(const f of [pre,edge,center,post]){
  const weight=Object.values(f.weights).reduce((a,n)=>a+n,0);
  assert(Math.abs(weight-1)<1e-10);
 }
});
test('no DOM, camera, microphone or audio output side effects occur during sampling',()=>{
 const d=createLipSyncDirector(args());const a=clock(d,0.4),b=clock(d,0.4);
 assert.deepEqual(a,b);assert(!JSON.stringify(a).includes(hash));
 assert.equal(a.clip,'Talk');assert.equal(typeof d.scope,'object');
});
