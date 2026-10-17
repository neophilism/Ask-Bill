/** AB-079: original-character voice/persona *direction* only. No TTS or license claims. */
export class VoiceDirectionError extends Error {
  constructor(code) { super(code); this.code=code;this.name='VoiceDirectionError'; }
}
const fail=code=>{throw new VoiceDirectionError(code)};
const ID=/^[a-z][a-z0-9-]{2,63}$/;
const NAME=/^[\p{L}\p{N} ,.'!?-]{3,90}$/u;
const TONES=new Set(['warm','calm','playful','measured','scholarly']);
const PERSONALITIES=new Set(['courtly','concise','curious','playful','scholarly']);
const PHRASE=/^[^\u0000-\u001f<>]{8,500}$/u;
const REQUIRED_LINES=['introduction','source','exception','uncertainty'];
function known(o,keys){
 if(!o||typeof o!=='object'||Array.isArray(o))fail('INVALID_OBJECT');
 for(const k of Object.keys(o))if(!keys.includes(k))fail('UNEXPECTED_FIELD');
}
export function validateVoiceDirection(input){
 known(input,['schemaVersion','characterId','voiceProviderStatus','licensedVoiceAsset','profiles','testLines']);
 if(input.schemaVersion!==1||input.characterId!=='bill'||input.voiceProviderStatus!=='not_selected'||input.licensedVoiceAsset!==null)fail('UNLICENSED_VOICE_MUST_STAY_OFF');
 if(!Array.isArray(input.profiles)||input.profiles.length<1||input.profiles.length>12)fail('PROFILE_LIMIT');
 const ids=new Set();let defaults=0;const profiles=[];
 for(const p of input.profiles){
  known(p,['id','displayName','identityReference','presentation','tone','rate','styleHint','isDefault']);
  if(typeof p.id!=='string'||!ID.test(p.id)||ids.has(p.id))fail('PROFILE_ID_INVALID');
  ids.add(p.id);
  if(typeof p.displayName!=='string'||!NAME.test(p.displayName)||p.identityReference!=='original-character'||
     !PERSONALITIES.has(p.presentation)||!TONES.has(p.tone)||typeof p.rate!=='number'||
     !Number.isFinite(p.rate)||p.rate<0.7||p.rate>1.3||typeof p.styleHint!=='string'||
     !PHRASE.test(p.styleHint)||typeof p.isDefault!=='boolean')fail('INVALID_PROFILE');
  if(p.isDefault)defaults++;
  profiles.push(Object.freeze({...p}));
 }
 if(defaults!==1)fail('DEFAULT_PROFILE_REQUIRED');
 known(input.testLines,REQUIRED_LINES);
 if(Object.keys(input.testLines).length!==REQUIRED_LINES.length||REQUIRED_LINES.some(k=>typeof input.testLines[k]!=='string'||!PHRASE.test(input.testLines[k])))fail('INVALID_TEST_LINES');
 return Object.freeze({schemaVersion:1,characterId:'bill',voiceProviderStatus:'not_selected',licensedVoiceAsset:null,
   profiles:Object.freeze(profiles),testLines:Object.freeze({...input.testLines})});
}
/** Returns display-only persona metadata; no selected synthesis voice or secrets. */
export function selectPersona(catalog,id){
 const verified=validateVoiceDirection(catalog);
 if(id!==undefined&&(typeof id!=='string'||!ID.test(id)))fail('PROFILE_ID_INVALID');
 const candidate=verified.profiles.find(p=>id===undefined?p.isDefault:p.id===id);
 if(!candidate)fail('UNKNOWN_PERSONA');
 return candidate;
}
/** Voice is unavailable until an independently verified provider and rights are integrated. */
export function speechCapability(manifest){
 const catalog=validateVoiceDirection(manifest);
 return Object.freeze({enabled:false,reason:'LICENSE_AND_PROVIDER_NOT_SELECTED',
   fallback:'display-exact-validated-text',availablePersonas:catalog.profiles.map(p=>p.id)});
}
/** Persona changes delivery only; never reword verified legislative text. */
export function deliveryPolicy({catalog,personaId}={}){
 const p=selectPersona(catalog,personaId);
 return Object.freeze({personaId:p.id,rate:p.rate,tone:p.tone,presentation:p.presentation,
   contentAuthority:'validated-source-text-only',allowClaimsWithoutEvidence:false,
   allowUnlicensedSpeech:false,allowImplicitMicrophone:false});
}
