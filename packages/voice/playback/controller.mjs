/**
 * Ask Bill AB-082: gesture-gated, source/version-fenced browser AudioContext transport.
 * NO recording, model request, provider authorization, audio URL loading, or autoplay.
 * A server must separately authorize/licence validated source audio before calling load().
 */
export class PlaybackError extends Error {
  constructor(code) { super(code); this.name='PlaybackError'; this.code=code; }
}
const fail=code=>{throw new PlaybackError(code);};
const VALID_SHA=/^[0-9a-f]{64}$/;
const VALID_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const VALID_STATES=new Set(['empty','ready','playing','paused','completed','stopped','disposed']);
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
const normNumber=(value,min,max,code)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(code);
  return value;
};
function validateClip(buffer,meta,maxSeconds) {
  if(!buffer||typeof buffer!=='object'||typeof buffer.duration!=='number'||
     !Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>maxSeconds||
     !Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1||buffer.numberOfChannels>2||
     !Number.isInteger(buffer.sampleRate)||buffer.sampleRate<8000||buffer.sampleRate>192000)fail('BUFFER_INVALID');
  if(!meta||typeof meta!=='object'||Array.isArray(meta)||
     Object.keys(meta).some(k=>!['versionId','segmentId','conversationEpoch','textSha256','audioSha256','durationSeconds','sourceValidated','voiceLicensed'].includes(k))||
     !VALID_ID.test(meta.versionId)||!VALID_ID.test(meta.segmentId)||
     !Number.isSafeInteger(meta.conversationEpoch)||meta.conversationEpoch<0||
     !VALID_SHA.test(meta.textSha256)||!VALID_SHA.test(meta.audioSha256)||
     meta.sourceValidated!==true||meta.voiceLicensed!==true||
     typeof meta.durationSeconds!=='number'||!Number.isFinite(meta.durationSeconds)||
     Math.abs(meta.durationSeconds-buffer.duration)>0.03)fail('UNVERIFIED_AUDIO');
  return Object.freeze({...meta});
}
/**
 * Create once per active conversation. Caller injects only a browser AudioContext
 * factory; a browser gesture must call play({userGesture:true,...source scope}).
 * Raw question and audio bytes are never put into telemetry or status objects.
 */
export function createAudioPlaybackController({createContext=()=>new AudioContext(),onState=()=>{},maxSeconds=180}={}){
  if(typeof createContext!=='function'||typeof onState!=='function')fail('ADAPTER_INVALID');
  normNumber(maxSeconds,1,600,'DURATION_LIMIT_INVALID');
  let context=null,source=null,gain=null,meta=null,buffer=null,state='empty',offset=0;
  let startedAt=0,rate=1,muted=false,operation=0,hidden=false;
  const assertLive=()=>{if(state==='disposed')fail('PLAYER_DISPOSED');};
  const duration=()=>buffer?.duration??0;
  const position=()=>state==='playing'&&context?
    clamp(offset+(context.currentTime-startedAt)*rate,0,duration()):clamp(offset,0,duration());
  const snapshot=()=>Object.freeze({state,positionSeconds:position(),durationSeconds:duration(),rate,muted,
    versionId:meta?.versionId??null,segmentId:meta?.segmentId??null,
    conversationEpoch:meta?.conversationEpoch??null,hidden});
  const publish=()=>{try{onState(snapshot());}catch{/* UI observer cannot interrupt transport */}};
  const releaseSource=()=>{
    const old=source; source=null; operation++;
    if(old){old.onended=null;try{old.stop(0);}catch{}try{old.disconnect();}catch{}}
  };
  const scope=(versionId,conversationEpoch)=>{
    if(!meta||versionId!==meta.versionId||conversationEpoch!==meta.conversationEpoch)fail('STALE_CONVERSATION');
  };
  const startNode=()=>{
    const node=context.createBufferSource();
    if(!node||typeof node.start!=='function'||typeof node.connect!=='function')fail('AUDIO_ADAPTER_INVALID');
    node.buffer=buffer; node.playbackRate.value=rate;
    node.connect(gain);
    const token=++operation;
    node.onended=()=>{
      if(source!==node||token!==operation||state!=='playing')return;
      try{node.disconnect();}catch{}
      source=null;offset=duration();state='completed';publish();
    };
    startedAt=context.currentTime;
    source=node;
    try{node.start(0,offset);}catch{releaseSource();state='paused';fail('PLAYBACK_START_FAILED');}
  };
  return Object.freeze({
    getSnapshot:snapshot,
    load({audioBuffer,metadata}={}){
      assertLive();
      const checked=validateClip(audioBuffer,metadata,maxSeconds);
      releaseSource();buffer=audioBuffer;meta=checked;offset=0;state='ready';publish();return snapshot();
    },
    async play({userGesture=false,versionId,conversationEpoch}={}){
      assertLive();scope(versionId,conversationEpoch);
      if(userGesture!==true)fail('USER_GESTURE_REQUIRED');
      if(hidden)fail('BACKGROUND_AUDIO_DISABLED');
      if(state==='playing')return snapshot();
      if(!['ready','paused','completed','stopped'].includes(state))fail('AUDIO_NOT_READY');
      if(state==='completed'||state==='stopped')offset=0;
      const token=++operation;
      if(!context){context=createContext();if(!context||typeof context.resume!=='function'||
        typeof context.createBufferSource!=='function'||typeof context.createGain!=='function')fail('AUDIO_ADAPTER_INVALID');
        gain=context.createGain();gain.gain.value=muted?0:1;gain.connect(context.destination);
      }
      try{await context.resume();}catch{if(token===operation){state='paused';publish();}fail('AUDIO_UNAVAILABLE');}
      if(token!==operation||state==='disposed'||hidden)fail('PLAY_INTERRUPTED');
      if(state==='playing')return snapshot();
      startNode();state='playing';publish();return snapshot();
    },
    pause(){
      assertLive();if(state!=='playing')return snapshot();
      offset=position();releaseSource();state='paused';publish();return snapshot();
    },
    stop(){
      assertLive();releaseSource();offset=0;state=buffer?'stopped':'empty';publish();return snapshot();
    },
    setRate(value){
      assertLive();normNumber(value,0.75,1.5,'RATE_INVALID');
      if(state==='playing'){offset=position();startedAt=context.currentTime;source.playbackRate.value=value;}
      rate=value;publish();return snapshot();
    },
    setMuted(value){
      assertLive();if(typeof value!=='boolean')fail('MUTE_INVALID');
      muted=value;if(gain)gain.gain.value=muted?0:1;publish();return snapshot();
    },
    visibilityChanged(isHidden){
      assertLive();if(typeof isHidden!=='boolean')fail('VISIBILITY_INVALID');
      if(isHidden&&state==='playing'){offset=position();releaseSource();state='paused';}
      hidden=isHidden;publish();return snapshot();
    },
    invalidate({versionId,conversationEpoch}={}){
      assertLive();
      if(!VALID_ID.test(versionId)||!Number.isSafeInteger(conversationEpoch)||conversationEpoch<0)fail('SCOPE_INVALID');
      if(meta&&(meta.versionId!==versionId||meta.conversationEpoch!==conversationEpoch)){
        releaseSource();buffer=null;meta=null;offset=0;state='empty';publish();
      }
      return snapshot();
    },
    async dispose(){
      if(state==='disposed')return snapshot();
      releaseSource();buffer=null;meta=null;offset=0;state='disposed';publish();
      const old=context;context=null;gain=null;
      if(old&&typeof old.close==='function')try{await old.close();}catch{/* released resources */}
      return snapshot();
    }
  });
}
