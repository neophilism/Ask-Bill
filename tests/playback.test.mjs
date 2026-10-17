import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioPlaybackController,PlaybackError} from '../packages/voice/playback/controller.mjs';
const SHA='1'.repeat(64);
const meta={versionId:'bill-v1',segmentId:'seg-1',conversationEpoch:2,textSha256:SHA,
  audioSha256:'2'.repeat(64),durationSeconds:8,sourceValidated:true,voiceLicensed:true};
const buffer={duration:8,numberOfChannels:1,sampleRate:48000};
const goodScope={userGesture:true,versionId:'bill-v1',conversationEpoch:2};
const reject=(code)=>e=>e instanceof PlaybackError&&e.code===code;
function fakeAudio({resumePromise=null}={}){
 let contextCount=0,closed=0; const nodes=[],gainValue={value:1};
 const ctx={currentTime:0,destination:{},async resume(){if(resumePromise)await resumePromise;},async close(){closed++;},
  createGain(){return{gain:gainValue,connect(){}};},createBufferSource(){
    const n={playbackRate:{value:1},startCount:0,stopCount:0,startOffset:null,
      connect(){},disconnect(){this.disconnected=true;},start(when,offset){this.startCount++;this.startOffset=offset;},
      stop(){this.stopCount++;}};nodes.push(n);return n;
  }};
 return {ctx,nodes,gainValue,get contexts(){return contextCount;},get closed(){return closed;},createContext(){contextCount++;return ctx;}};
}
test('loading validated audio never initializes or plays AudioContext automatically',async()=>{
 const f=fakeAudio(),updates=[];
 const player=createAudioPlaybackController({createContext:()=>f.createContext(),onState:s=>updates.push(s)});
 assert.equal(player.getSnapshot().state,'empty');
 player.load({audioBuffer:buffer,metadata:meta});
 assert.equal(player.getSnapshot().state,'ready');assert.equal(f.contexts,0);
 await assert.rejects(player.play({...goodScope,userGesture:false}),reject('USER_GESTURE_REQUIRED'));
 assert.equal(f.contexts,0);
 await player.play(goodScope);
 assert.equal(f.contexts,1);assert.equal(f.nodes.length,1);
 assert.equal(f.nodes[0].startOffset,0);
 assert.equal(player.getSnapshot().state,'playing');
 await player.dispose();assert.equal(f.closed,1);
 assert(updates.every(s=>!JSON.stringify(s).includes(SHA)));
});
test('pause, resume and rate changes preserve the audio clock without changing source text',async()=>{
 const f=fakeAudio(),p=createAudioPlaybackController({createContext:()=>f.ctx});
 p.load({audioBuffer:buffer,metadata:meta});await p.play(goodScope);
 f.ctx.currentTime=2;assert.equal(p.getSnapshot().positionSeconds,2);
 p.setRate(1.5);f.ctx.currentTime=4;assert.equal(p.getSnapshot().positionSeconds,5);
 p.pause();assert.equal(p.getSnapshot().state,'paused');assert.equal(p.getSnapshot().positionSeconds,5);
 await p.play(goodScope);assert.equal(f.nodes.length,2);assert.equal(f.nodes[1].startOffset,5);
 f.ctx.currentTime=5;assert.equal(p.getSnapshot().positionSeconds,6.5);
 f.nodes[1].onended();assert.equal(p.getSnapshot().state,'completed');
 assert.equal(p.getSnapshot().positionSeconds,8);
 await p.play(goodScope);assert.equal(f.nodes[2].startOffset,0);
 await p.dispose();
});
test('version/epoch changes cancel old clip and ignore stale onended events',async()=>{
 const f=fakeAudio(),p=createAudioPlaybackController({createContext:()=>f.ctx});
 p.load({audioBuffer:buffer,metadata:meta});await p.play(goodScope);
 const oldEnd=f.nodes[0].onended;
 p.invalidate({versionId:'bill-v2',conversationEpoch:3});
 assert.equal(p.getSnapshot().state,'empty');oldEnd();assert.equal(p.getSnapshot().state,'empty');
 await assert.rejects(p.play(goodScope),reject('STALE_CONVERSATION'));
 p.load({audioBuffer:buffer,metadata:{...meta,versionId:'bill-v2',conversationEpoch:3}});
 await p.play({userGesture:true,versionId:'bill-v2',conversationEpoch:3});
 assert.equal(p.getSnapshot().state,'playing');await p.dispose();
});
test('hidden tab pauses and never autoplays on visibility return',async()=>{
 const f=fakeAudio(),p=createAudioPlaybackController({createContext:()=>f.ctx});
 p.load({audioBuffer:buffer,metadata:meta});await p.play(goodScope);
 f.ctx.currentTime=1;p.visibilityChanged(true);assert.equal(p.getSnapshot().state,'paused');
 await assert.rejects(p.play(goodScope),reject('BACKGROUND_AUDIO_DISABLED'));
 p.visibilityChanged(false);assert.equal(p.getSnapshot().state,'paused');
 assert.equal(f.nodes.length,1);await p.play(goodScope);assert.equal(f.nodes.length,2);await p.dispose();
});
test('mute controls output gain rather than hiding captions or rewinding',async()=>{
 const f=fakeAudio(),p=createAudioPlaybackController({createContext:()=>f.ctx});
 p.load({audioBuffer:buffer,metadata:meta});await p.play(goodScope);
 f.ctx.currentTime=3;p.setMuted(true);assert.equal(f.gainValue.value,0);
 assert.equal(p.getSnapshot().positionSeconds,3);p.setMuted(false);assert.equal(f.gainValue.value,1);
 assert.equal(p.getSnapshot().state,'playing');await p.dispose();
});
test('unverified clips, oversized buffers, unknown metadata, and invalid controls fail closed',async()=>{
 const p=createAudioPlaybackController({createContext:()=>fakeAudio().ctx});
 for(const m of [{...meta,sourceValidated:false},{...meta,voiceLicensed:false},{...meta,extra:'evil'},
                  {...meta,durationSeconds:9},{...meta,audioSha256:'wrong'},{...meta,conversationEpoch:-1}]){
  assert.throws(()=>p.load({audioBuffer:buffer,metadata:m}),reject('UNVERIFIED_AUDIO'));
 }
 assert.throws(()=>p.load({audioBuffer:{...buffer,duration:700},metadata:meta}),reject('BUFFER_INVALID'));
 p.load({audioBuffer:buffer,metadata:meta});
 for(const n of [0,0.3,2,Infinity,'1'])assert.throws(()=>p.setRate(n),reject('RATE_INVALID'));
 assert.throws(()=>p.setMuted('yes'),reject('MUTE_INVALID'));
 assert.throws(()=>p.visibilityChanged('hidden'),reject('VISIBILITY_INVALID'));
 await assert.rejects(p.play({userGesture:true,versionId:'other',conversationEpoch:2}),reject('STALE_CONVERSATION'));
 await p.dispose();assert.throws(()=>p.load({audioBuffer:buffer,metadata:meta}),reject('PLAYER_DISPOSED'));
});
test('pending resume cannot revive a stopped/invalidated conversation',async()=>{
 let resumeDone;const gate=new Promise(resolve=>resumeDone=resolve);
 const f=fakeAudio({resumePromise:gate});const p=createAudioPlaybackController({createContext:()=>f.ctx});
 p.load({audioBuffer:buffer,metadata:meta});const pending=p.play(goodScope);
 p.stop();resumeDone();await assert.rejects(pending,reject('PLAY_INTERRUPTED'));
 assert.equal(f.nodes.length,0);assert.equal(p.getSnapshot().state,'stopped');
 await p.dispose();
});
test('audio resume failures never leave a fake playing state',async()=>{
 const f=fakeAudio();f.ctx.resume=async()=>{throw Error('restricted');};
 const p=createAudioPlaybackController({createContext:()=>f.ctx});p.load({audioBuffer:buffer,metadata:meta});
 await assert.rejects(p.play(goodScope),reject('AUDIO_UNAVAILABLE'));
 assert.equal(p.getSnapshot().state,'paused');await p.dispose();
});
