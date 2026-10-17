import test from 'node:test';import assert from 'node:assert/strict';
import {createPushToTalk,SpeechInputError} from '../packages/voice/stt/push-to-talk.mjs';
const scope={versionId:'v1',conversationEpoch:1};
const now=()=>100000;
function fixture(opts={}){
 let calls=0,stops=0,mediaProm=null,resolvePermission;
 const tracks=[{stop(){stops++}}];
 const media=opts.deferredPermission?{getUserMedia(){calls++;mediaProm=new Promise(resolve=>{resolvePermission=resolve});return mediaProm;}}:{async getUserMedia(){calls++;if(opts.deny)throw Error('permission denied');return {getTracks:()=>tracks};}};
 let recorder;
 const makeRecorder=()=>{recorder={state:'inactive',start(){this.state='recording';},stop(){this.state='inactive';this.ondataavailable?.({data:{size:22}});this.onstop?.();}};return recorder;};
 const transcripts=[];
 const transcriber={async transcribe({audio,signal}){transcripts.push({audio:audio.length,aborted:signal.aborted});return {text:'recognized legal question',language:'en-US'};}};
 const policy=opts.disabled?{enabled:false}:{enabled:true,retention:'verified-minimal'};
 const tasks=[];
 const controller=createPushToTalk({mediaDevices:media,createRecorder:makeRecorder,transcriber,providerPolicy:policy,now,
   setTimer:fn=>{tasks.push(fn);return tasks.length-1;},clearTimer:id=>{tasks[id]=null;}});
 return {controller,tasks,transcripts,get calls(){return calls},get stops(){return stops},get recorder(){return recorder},release(){resolvePermission({getTracks:()=>tracks})}};
}
const begin={userGesture:true,ageBand:'adult',mimeType:'audio/webm',...scope};
test('unconfigured production STT never opens a microphone or collects audio',async()=>{
 const f=fixture({disabled:true});await assert.rejects(f.controller.begin(begin),SpeechInputError);
 assert.equal(f.calls,0);assert.equal(f.controller.snapshot().canType,true);
});
test('explicit gesture and adult routing required before permission API is called',async()=>{
 const f=fixture();for(const input of [{...begin,userGesture:false},{...begin,ageBand:'under13'},{...begin,ageBand:'unknown'},
 {...begin,mimeType:'audio/unknown'},{...begin,versionId:'../secrets'}])await assert.rejects(f.controller.begin(input),SpeechInputError);
 assert.equal(f.calls,0);
});
test('recording only begins after permission and is stopped on request',async()=>{
 const f=fixture();const s=await f.controller.begin(begin);assert.equal(f.calls,1);assert.equal(s.recording,true);assert.equal(s.hasAudio,false);
 assert.equal(f.controller.stopRecording(scope).state,'recorded');assert.equal(f.stops,1);assert.equal(f.controller.snapshot().hasAudio,true);
});
test('user-triggered transcription returns editable text, never submits a question automatically',async()=>{
 const f=fixture();await f.controller.begin(begin);f.controller.stopRecording(scope);
 await assert.rejects(f.controller.transcribe({...scope,userGesture:false}),SpeechInputError);
 const result=await f.controller.transcribe({...scope,userGesture:true});assert.equal(result.text,'recognized legal question');
 assert.equal(result.automaticallySubmitted,false);assert.equal(f.transcripts.length,1);
 f.controller.editTranscript('What does this section mean?');const text=f.controller.submitText({...scope,userGesture:true});
 assert.equal(text.text,'What does this section mean?');assert.equal(text.questionSubmissionAuthorized,false);
 assert.equal(f.controller.snapshot().hasTranscript,false);
});
test('revoking permission during pending request stops newly arriving tracks and refuses recording',async()=>{
 const f=fixture({deferredPermission:true});const task=f.controller.begin(begin);
 f.controller.cancel();f.release();await assert.rejects(task,SpeechInputError);
 assert.equal(f.stops,1);assert.equal(f.controller.snapshot().state,'cancelled');
});
test('version/epoch change immediately discards pending audio and prevents stale speech',async()=>{
 const f=fixture();await f.controller.begin(begin);f.controller.invalidate({versionId:'v2',conversationEpoch:2});
 assert.equal(f.stops,1);assert.equal(f.controller.snapshot().hasAudio,false);
 assert.throws(()=>f.controller.stopRecording(scope),SpeechInputError);
});
test('denied microphone permission always preserves typed questions',async()=>{
 const f=fixture({deny:true});await assert.rejects(f.controller.begin(begin),SpeechInputError);
 assert.equal(f.controller.snapshot().state,'denied');assert.equal(f.controller.snapshot().canType,true);
});
test('no silent transcript replay after explicit cancel or dispose',async()=>{
 const f=fixture();await f.controller.begin(begin);f.controller.stopRecording(scope);
 f.controller.cancel();assert.equal(f.controller.snapshot().hasAudio,false);await assert.rejects(f.controller.transcribe({...scope,userGesture:true}),SpeechInputError);
 f.controller.dispose();assert.equal(f.controller.snapshot().state,'disposed');await assert.rejects(f.controller.begin(begin),SpeechInputError);
});
test('invalid policy or missing approved transcriber fail at construction',()=>{
 assert.throws(()=>createPushToTalk({providerPolicy:{enabled:true},mediaDevices:{getUserMedia(){}},createRecorder(){}}),SpeechInputError);
 assert.throws(()=>createPushToTalk({providerPolicy:{enabled:'true'}}),SpeechInputError);
});
test('recorded audio is limited and not leaked to status snapshots',async()=>{
 const f=fixture();await f.controller.begin(begin);f.controller.stopRecording(scope);
 const info=JSON.stringify(f.controller.snapshot());assert(!info.includes('audio/webm'));assert(!info.includes('recognized legal question'));assert(!info.includes('bytes'));
});
