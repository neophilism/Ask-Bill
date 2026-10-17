/** AB-085: privacy-first opt-in speech input and corrected transcript state.
 * No recording is allowed by default. This module never initiates network requests,
 * sends raw audio into conversation, or stores any persistent recording/history.
 * All server claims, parental-consent authorization and provider retention checks
 * MUST be independently enforced by the backend before enabling a real adapter.
 */
export class SpeechInputError extends Error{
  constructor(code){super(code);this.name='SpeechInputError';this.code=code;}
}
const deny=code=>{throw new SpeechInputError(code)};
const allowedMime=new Set(['audio/webm','audio/ogg','audio/mp4']);
const sourceId=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const textSafe=s=>typeof s==='string'&&s.trim().length>0&&s.length<=4000&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
/** Opt-in local driver. Production must use server-provisioned capability checks too. */
export function createPushToTalk({mediaDevices,createRecorder,transcriber=null,
    providerPolicy={enabled:false},onStatus=()=>{},now=()=>Date.now(),
    setTimer=(f,delay)=>setTimeout(f,delay),clearTimer=id=>clearTimeout(id),
    maxSeconds=30,maxBytes=4000000}={}){
  if(typeof onStatus!=='function'||typeof now!=='function'||typeof setTimer!=='function'||typeof clearTimer!=='function'||
    !Number.isSafeInteger(maxSeconds)||maxSeconds<5||maxSeconds>60||
    !Number.isSafeInteger(maxBytes)||maxBytes<100000||maxBytes>10000000)deny('INVALID_CONFIGURATION');
  if(!providerPolicy||typeof providerPolicy!=='object'||Array.isArray(providerPolicy)||typeof providerPolicy.enabled!=='boolean')deny('INVALID_PROVIDER_POLICY');
  if(providerPolicy.enabled && (providerPolicy.retention!=='verified-minimal'||typeof transcriber?.transcribe!=='function'||
      typeof mediaDevices?.getUserMedia!=='function'||typeof createRecorder!=='function'))deny('LIVE_STT_NOT_CONFIGURED');
  let state='idle',session=0,stream=null,recorder=null,chunks=[],bytes=0,transcript='',age='unknown',
    versionId=null,epoch=null,recordStart=0,timer=null,abort=null,destroyed=false,mime=null;
  const snapshot=()=>Object.freeze({state,canType:true,recording:state==='recording',hasAudio:chunks.length>0,
    hasTranscript:state==='reviewing'&&!!transcript,providerAvailable:providerPolicy.enabled,ageEligible:age==='adult',
    versionId,conversationEpoch:epoch});
  const emit=()=>{try{onStatus(snapshot());}catch{/* UI observer can't affect data safety */}};
  const cancelTimer=()=>{if(timer!==null){clearTimer(timer);timer=null;}};
  const stopTracks=()=>{const old=stream;stream=null;
    try{for(const track of old?.getTracks()??[])track.stop();}catch{}};
  const discard=()=>{cancelTimer();if(abort){abort.abort();abort=null;}const old=recorder;recorder=null;
    if(old){old.ondataavailable=null;old.onstop=null;old.onerror=null;
      try{if(old.state!=='inactive')old.stop();}catch{}}
    stopTracks();chunks=[];bytes=0;transcript='';mime=null;};
  const ensure=()=>{if(destroyed)deny('INPUT_DISPOSED');};
  const scoped=(scope)=>{if(!scope||scope.versionId!==versionId||scope.conversationEpoch!==epoch)deny('STALE_CONVERSATION');};
  const hasProvider=()=>providerPolicy.enabled===true;
  return Object.freeze({
    snapshot,
    /** Does not call a microphone API unless all explicit user-side gates pass. */
    async begin({userGesture=false,ageBand='unknown',versionId:version,conversationEpoch:ep,mimeType='audio/webm'}={}){
      ensure();if(!hasProvider())deny('SPEECH_UNAVAILABLE');
      if(userGesture!==true)deny('USER_GESTURE_REQUIRED');
      if(ageBand!=='adult')deny('AGE_GATE_REQUIRED');
      if(!sourceId.test(version??'')||!Number.isSafeInteger(ep)||ep<0)deny('INVALID_SCOPE');
      if(!allowedMime.has(mimeType))deny('UNSUPPORTED_AUDIO_FORMAT');
      if(!['idle','cancelled','denied','failed','submitted'].includes(state))deny('INPUT_BUSY');
      discard();age=ageBand;versionId=version;epoch=ep;const ticket=++session;state='requesting';emit();
      let obtained;
      try{obtained=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});}
      catch{if(ticket===session){discard();state='denied';emit();}deny('MIC_PERMISSION_DENIED');}
      if(ticket!==session||destroyed||state!=='requesting'){
        try{for(const track of obtained?.getTracks()??[])track.stop();}catch{}deny('MIC_REQUEST_CANCELLED');
      }
      if(!obtained||typeof obtained.getTracks!=='function'){
        discard();state='failed';emit();deny('INVALID_MIC_STREAM');
      }
      stream=obtained;mime=mimeType;
      try{
        recorder=createRecorder(obtained,mimeType);
        if(!recorder||typeof recorder.start!=='function'||typeof recorder.stop!=='function')deny('RECORDER_UNAVAILABLE');
        recorder.ondataavailable=event=>{
          if(ticket!==session||!['recording','stopping'].includes(state))return;
          const chunk=event?.data;
          if(!chunk||!Number.isSafeInteger(chunk.size)||chunk.size<0){discard();state='failed';emit();return;}
          if(chunk.size>0){bytes+=chunk.size;if(bytes>maxBytes){discard();state='failed';emit();return;}chunks.push(chunk);}
        };
        recorder.onerror=()=>{if(ticket===session){discard();state='failed';emit();}};
        recorder.onstop=()=>{if(ticket===session&&state==='stopping'){
          stopTracks();cancelTimer();state=chunks.length?'recorded':'failed';emit();}
        };
        recordStart=now();if(!Number.isFinite(recordStart))deny('INVALID_CLOCK');
        recorder.start(1000);state='recording';emit();
        timer=setTimer(()=>{if(ticket===session&&state==='recording')this.stopRecording({versionId,conversationEpoch:epoch});},maxSeconds*1000);
        return snapshot();
      }catch{discard();state='failed';emit();deny('RECORDER_START_FAILED');}
    },
    stopRecording(scope){
      ensure();scoped(scope);if(state!=='recording')deny('NOT_RECORDING');
      const duration=now()-recordStart;if(!Number.isFinite(duration)||duration<0){discard();state='failed';emit();deny('INVALID_CLOCK');}
      if(duration>maxSeconds*1000+5000){discard();state='failed';emit();deny('RECORDING_LIMIT');}
      cancelTimer();state='stopping';emit();
      try{recorder.stop();}catch{discard();state='failed';emit();deny('RECORDER_STOP_FAILED');}
      return snapshot();
    },
    /** Audio is sent only after the user explicitly requests transcription. */
    async transcribe({userGesture=false,versionId:version,conversationEpoch:ep}={}){
      ensure();scoped({versionId:version,conversationEpoch:ep});if(!hasProvider())deny('SPEECH_UNAVAILABLE');
      if(userGesture!==true)deny('USER_GESTURE_REQUIRED');if(state!=='recorded'||!chunks.length)deny('AUDIO_NOT_READY');
      const ticket=++session;const audio=chunks.slice();const format=mime;chunks=[];bytes=0;
      abort=new AbortController();state='transcribing';emit();
      try{
        const reply=await transcriber.transcribe(Object.freeze({audio:Object.freeze(audio),mimeType:format,
          versionId:version,conversationEpoch:ep,signal:abort.signal}));
        if(ticket!==session||destroyed||state!=='transcribing')deny('TRANSCRIPTION_CANCELLED');
        if(!reply||typeof reply!=='object'||!textSafe(reply.text)||!['en','en-US','es','es-ES'].includes(reply.language))deny('UNUSABLE_TRANSCRIPT');
        transcript=reply.text;state='reviewing';abort=null;emit();
        return Object.freeze({text:transcript,language:reply.language,editable:true,automaticallySubmitted:false});
      }catch(e){if(ticket===session){discard();state='failed';emit();}
        if(e instanceof SpeechInputError)throw e;
        deny('TRANSCRIPTION_UNAVAILABLE');
      }
    },
    editTranscript(text){ensure();if(state!=='reviewing')deny('NOT_REVIEWING');if(!textSafe(text))deny('TRANSCRIPT_INVALID');
      transcript=text;emit();return Object.freeze({text:transcript,editable:true,automaticallySubmitted:false});},
    submitText({userGesture=false,versionId:version,conversationEpoch:ep}={}){
      ensure();scoped({versionId:version,conversationEpoch:ep});if(userGesture!==true)deny('USER_GESTURE_REQUIRED');
      if(state!=='reviewing'||!textSafe(transcript))deny('TRANSCRIPT_NOT_REVIEWED');
      const result=transcript;transcript='';state='submitted';emit();
      return Object.freeze({text:result,versionId:version,conversationEpoch:ep,questionSubmissionAuthorized:false});
    },
    cancel(){ensure();session++;discard();state='cancelled';emit();return snapshot();},
    invalidate({versionId:version,conversationEpoch:ep}={}){
      ensure();if(!sourceId.test(version??'')||!Number.isSafeInteger(ep)||ep<0)deny('INVALID_SCOPE');
      if(version!==versionId||ep!==epoch){session++;discard();state='idle';versionId=version;epoch=ep;emit();}
      return snapshot();
    },
    dispose(){if(destroyed)return snapshot();destroyed=true;session++;discard();state='disposed';emit();return snapshot();}
  });
}
