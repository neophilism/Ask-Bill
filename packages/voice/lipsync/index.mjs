/** AB-083: pure audio-clock-driven mouth morph planning, never a speech provider. */
export class LipSyncError extends Error {
  constructor(code){super(code);this.name='LipSyncError';this.code=code;}
}
const fail=code=>{throw new LipSyncError(code);};
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const ALIGNS=new Set(['provider','forced_alignment','approximate','none']);
/** This maps AB-081 labels to the real twenty-candidate glTF MouthVisemes mesh. */
export const VISEME_TARGETS=Object.freeze({
  AA:'viseme_AA',EH:'viseme_EE',OH:'viseme_OH',OO:'viseme_OO',
  MBP:'viseme_MBP',FV:'viseme_FV',L:'viseme_L',S:'viseme_SS',REST:'viseme_sil'
});
const clamp=(x,lo=0,hi=1)=>Math.min(hi,Math.max(lo,x));
const id=v=>typeof v==='string'&&ID.test(v);
const freeze=o=>Object.freeze(o);
function validateTiming(timing,scope){
  if(!timing||typeof timing!=='object'||Array.isArray(timing)||
     timing.validatedBy!=='ask-bill-speech-timing-v1'||
     timing.versionId!==scope.versionId||timing.sourceTextSha256!==scope.textSha256||
     timing.playbackAuthorized!==false||!ALIGNS.has(timing.alignment)||
     typeof timing.durationSeconds!=='number'||!Number.isFinite(timing.durationSeconds)||
     timing.durationSeconds<=0||timing.durationSeconds>180||
     !Array.isArray(timing.visemes)||timing.visemes.length>1600)fail('TIMING_NOT_SOURCE_VERIFIED');
  let until=0;
  for(const v of timing.visemes){
    if(!v||typeof v!=='object'||!Object.hasOwn(VISEME_TARGETS,v.label)||
      typeof v.from!=='number'||typeof v.to!=='number'||
      !Number.isFinite(v.from)||!Number.isFinite(v.to)||v.from<until||
      v.to<=v.from||v.to>timing.durationSeconds||
      typeof v.weight!=='number'||!Number.isFinite(v.weight)||v.weight<0||v.weight>1)
      fail('TIMING_VISEME_INVALID');
    until=v.to;
  }
  if(timing.alignment==='none'&&timing.visemes.length!==0)fail('UNALIGNED_MOUTH_EVENTS');
}
export function createLipSyncDirector({timing,modelMorphNames,scope,coarticulationSeconds=0.045}={}){
  if(!scope||!id(scope.versionId)||!id(scope.segmentId)||!Number.isSafeInteger(scope.conversationEpoch)||
     scope.conversationEpoch<0||!HEX.test(scope.textSha256??''))fail('SPEECH_SCOPE_INVALID');
  if(!Array.isArray(modelMorphNames)||modelMorphNames.length>256||
     modelMorphNames.some(n=>typeof n!=='string'||!/^[A-Za-z0-9_]{1,64}$/.test(n))||
     !Number.isFinite(coarticulationSeconds)||coarticulationSeconds<0||coarticulationSeconds>0.1)
     fail('MODEL_MORPH_INVALID');
  validateTiming(timing,scope);
  const meshMorphs=new Set(modelMorphNames);
  const wanted=Object.values(VISEME_TARGETS);
  const available=wanted.every(n=>meshMorphs.has(n));
  const morphNames=freeze([...wanted]);
  const neutral=()=>freeze(Object.fromEntries(morphNames.map(name=>[name,name==='viseme_sil'?1:0])));
  let blocked=false;
  const reason=!available?'MOUTH_SHAPES_UNAVAILABLE':timing.alignment==='none'?'NO_VERIFIED_ALIGNMENT':null;
  function frame({audioSeconds,versionId,conversationEpoch,isPlaying=false,hidden=false,reducedMotion=false}={}){
    if(typeof audioSeconds!=='number'||!Number.isFinite(audioSeconds)||audioSeconds<0||
      !id(versionId)||!Number.isSafeInteger(conversationEpoch)||conversationEpoch<0||
      typeof isPlaying!=='boolean'||typeof hidden!=='boolean'||typeof reducedMotion!=='boolean')fail('FRAME_INVALID');
    if(versionId!==scope.versionId||conversationEpoch!==scope.conversationEpoch)fail('STALE_SPEECH_EPOCH');
    const enabled=available&&timing.alignment!=='none'&&!blocked&&isPlaying&&!hidden&&!reducedMotion&&
      audioSeconds<=timing.durationSeconds;
    if(!enabled)return freeze({enabled:false,reason:blocked?'INTERRUPTED':reason??'PAUSED_OR_REDUCED_MOTION',
      segmentId:scope.segmentId,weights:neutral(),clip:'Idle',mouthMask:morphNames});
    const weights=Object.fromEntries(morphNames.map(name=>[name,0]));
    // Timing comes exclusively from the actual AudioContext clock, never Date.now().
    // A symmetric short rise/fall avoids hard edges without fabricating phonemes.
    for(const v of timing.visemes){
      const s=coarticulationSeconds;
      if(audioSeconds<v.from-s||audioSeconds>v.to+s)continue;
      const up=s===0?(audioSeconds>=v.from?1:0):clamp((audioSeconds-v.from+s)/(2*s));
      const down=s===0?(audioSeconds<=v.to?1:0):clamp((v.to-audioSeconds+s)/(2*s));
      const strength=v.weight*Math.min(up,down);
      const morph=VISEME_TARGETS[v.label];weights[morph]=Math.max(weights[morph],strength);
    }
    const sum=Object.entries(weights).filter(([n])=>n!=='viseme_sil').reduce((a,[,n])=>a+n,0);
    if(sum>1)for(const name of morphNames)if(name!=='viseme_sil')weights[name]/=sum;
    const used=Object.entries(weights).filter(([n])=>n!=='viseme_sil').reduce((a,[,n])=>a+n,0);
    weights.viseme_sil=clamp(1-used);
    return freeze({enabled:true,reason:null,segmentId:scope.segmentId,
      weights:freeze(weights),clip:'Talk',mouthMask:morphNames});
  }
  return freeze({
    get supported(){return available&&timing.alignment!=='none';},
    get reason(){return reason;},
    frame,
    cancel(){blocked=true;return frame({audioSeconds:0,versionId:scope.versionId,
      conversationEpoch:scope.conversationEpoch,isPlaying:false});},
    get scope(){return freeze({...scope});}
  });
}
