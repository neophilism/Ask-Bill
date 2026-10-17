/** Ask Bill AB-080: offline speech preflight, NOT a live synthesis or delivery service. */
import {createHash, timingSafeEqual} from 'node:crypto';
import {parseValidatedSegment,verifyValidatedSegment} from '@ask-bill/contracts';
import {validateVoiceDirection,selectPersona,speechCapability} from '../direction/index.mjs';

export class SpeechGateError extends Error {
  constructor(code) { super(code);this.code=code;this.name='SpeechGateError'; }
}
const deny=code=>{throw new SpeechGateError(code);};
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;
const SUPPORTED=new Set(['en','en-US','es','es-ES']);
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const exactKeys=(object,keys)=>{
  if(!object||typeof object!=='object'||Array.isArray(object)||Object.keys(object).some(k=>!keys.includes(k)))deny('INVALID_REQUEST');
};
function checkSignal(signal){
  if(signal!==undefined && !(signal instanceof AbortSignal))deny('INVALID_ABORT_SIGNAL');
  if(signal?.aborted)deny('REQUEST_CANCELLED');
}
/** Validated text is a mandatory fallback; preparing it NEVER authorizes audio output. */
export function createSpeechPreflight({voiceCatalog,lookupSource,maxCharacters=2000,maxEstimatedSeconds=180}={}){
  const catalog=validateVoiceDirection(voiceCatalog);
  if(typeof lookupSource!=='function')deny('TRUSTED_SOURCE_LOOKUP_REQUIRED');
  if(!Number.isSafeInteger(maxCharacters)||maxCharacters<80||maxCharacters>10000||
     !Number.isSafeInteger(maxEstimatedSeconds)||maxEstimatedSeconds<10||maxEstimatedSeconds>600)deny('INVALID_BUDGET');
  if(speechCapability(catalog).enabled!==false)deny('UNLICENSED_SPEECH');
  return Object.freeze({
    async prepare(request){
      exactKeys(request,['segment','versionId','personaId','locale','sessionId','conversationEpoch','signal']);
      const {segment,versionId,personaId,locale='en-US',sessionId,conversationEpoch,signal}=request;
      checkSignal(signal);
      if(!ID.test(versionId??'')||!ID.test(sessionId??'')||
         !Number.isSafeInteger(conversationEpoch)||conversationEpoch<0||conversationEpoch>1000000000||
         !SUPPORTED.has(locale))deny('INVALID_SCOPE');
      const persona=selectPersona(catalog,personaId);
      let validated;
      try{validated=parseValidatedSegment(segment,versionId);}catch{deny('UNVALIDATED_SEGMENT');}
      if(validated.text.length<1||validated.text.length>maxCharacters)deny('SPEECH_TEXT_BUDGET');
      if(validated.claims.length<1||validated.claims.some(c=>c.kind!=='bill_text'||c.support!=='supported'||
          c.spans.length!==1||c.text!==c.spans[0].quote)||
         validated.text!==validated.claims.map(c=>c.text).join('\n\n'))deny('NOT_INDEPENDENTLY_REVIEWED_VERBATIM');
      // The trusted server adapter must return the exact canonical provision text for this version.
      const authoritative=new Map();
      for(const claim of validated.claims){
        const ref=claim.spans[0];
        const key=ref.provisionId;
        if(!authoritative.has(key)){
          let source;
          try{source=await lookupSource(Object.freeze({versionId,provisionId:key}));}
          catch{deny('SOURCE_UNAVAILABLE');}
          if(!source||source.versionId!==versionId||source.provisionId!==key||
             source.publication!=='published'||source.sourceComplete!==true||
             typeof source.text!=='string'||!HEX.test(source.sha256)||sha(source.text)!==source.sha256)
            deny('SOURCE_NOT_AUTHENTICATED');
          authoritative.set(key,source.text);
        }
      }
      try{await verifyValidatedSegment(validated,versionId,key=>authoritative.get(key));}
      catch{deny('QUOTE_VERIFICATION_FAILED');}
      checkSignal(signal);
      const words=validated.text.trim().split(/\s+/u).length;
      const seconds=Math.max(1,Math.ceil(words*60/120/persona.rate));
      if(seconds>maxEstimatedSeconds)deny('SPEECH_DURATION_BUDGET');
      const fingerprint=sha(JSON.stringify([sessionId,conversationEpoch,versionId,validated.id,
        validated.text,persona.id,locale]));
      return Object.freeze({kind:'speech_preflight_only',fingerprint,sessionId,conversationEpoch,
        versionId,segmentId:validated.id,textFallback:validated.text,
        personaId:persona.id,locale,estimatedSeconds:seconds,
        synthesisEnabled:false,deliveryAuthorized:false,publicAudioUrl:null});
    },
    /** A manifest or caller flag cannot turn on synthesis without approved rights and provider. */
    async synthesize(){deny('LICENSE_AND_PROVIDER_NOT_VERIFIED');},
    async deliver(){deny('LICENSE_AND_PROVIDER_NOT_VERIFIED');}
  });
}
/** Strictly inspect a binary provider candidate; never publish or cache it from this helper. */
export function inspectAudioCandidate({bytes,codec,expectedSha256,durationSeconds,validatedTextHash}={}){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<12||bytes.byteLength>10*1024*1024||
     !['audio/wav','audio/mpeg','audio/ogg'].includes(codec)||!HEX.test(expectedSha256??'')||
     !HEX.test(validatedTextHash??'')||typeof durationSeconds!=='number'||
     !Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>600)
    deny('AUDIO_CANDIDATE_INVALID');
  const calculated=createHash('sha256').update(bytes).digest();
  const expected=Buffer.from(expectedSha256,'hex');
  if(!timingSafeEqual(calculated,expected))deny('AUDIO_DIGEST_MISMATCH');
  return Object.freeze({kind:'unreleased_audio_candidate',bytes:bytes.byteLength,
    audioSha256:expectedSha256,textSha256:validatedTextHash,codec,durationSeconds,
    deliveryAuthorized:false,publicAudioUrl:null});
}
