/** AB-042: process-local cache for independently approved public, nonpersonal excerpts. */
import {createHash} from 'node:crypto';
import {encodeSse} from '../../streaming/index.mjs';
export class CacheError extends Error{constructor(code){super(code);this.name='CacheError';this.code=code;}}
const fail=c=>{throw new CacheError(c)};
const hex=/^[a-f0-9]{64}$/,id=s=>typeof s==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(s);
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const categories=new Set(['bill_explanation','definition']);
const allowedFields=['sourceSha256','modelSha256','promptSha256','validatorSha256','retrievalSha256','locale'];
function keyParts(route,config){
 if(!route||route.status!=='allowed'||route.sourcePublished!==true||
   route.sourceComplete!==true||!categories.has(route.category)||
   route.notLegalAdvice!==true||route.noModelToolExecution!==true||
   !id(route.versionId)||!id(route.publisherId)||!hex.test(route.questionSha256)||
   !Array.isArray(route.allowedVersionIds)||route.allowedVersionIds.length!==1||
   route.allowedVersionIds[0]!==route.versionId)fail('PRIVATE_OR_PERSONAL_CACHE_FORBIDDEN');
 if(!config||Object.keys(config).some(x=>!allowedFields.includes(x))||
   allowedFields.some(x=>config[x]===undefined))fail('CACHE_CONFIG');
 for(const x of allowedFields.slice(0,5))if(!hex.test(config[x]))fail('CACHE_HASH_INVALID');
 if(typeof config.locale!=='string'||!(/^[a-z]{2}(?:-[A-Z]{2})?$/).test(config.locale))fail('CACHE_LOCALE');
 return Object.freeze({publisherId:route.publisherId,versionId:route.versionId,
   questionSha256:route.questionSha256,category:route.category,...config});
}
export function publicAnswerCacheKey(route,config){return sha(JSON.stringify(keyParts(route,config)))}
function verifyIssuedEvent(event,route){
 if(!event||event.type!=='segment.validated'||event.documentVersion!==route.versionId||
   event.segment?.versionId!==route.versionId||event.segment?.claims?.length<1||
   event.segment.claims.some(c=>c.kind!=='bill_text'||c.support!=='supported'||
     !Array.isArray(c.spans)||!c.spans.length||c.spans.some(s=>s.sourceVersionId!==route.versionId)))fail('UNREVIEWED_CACHE_CONTENT');
 try{encodeSse(event)}catch{fail('SERVER_ISSUED_EVENT_REQUIRED');}
 return event;
}
export function createPublicAnswerCache({now=()=>Date.now(),maxEntries=500,ttlMs=300000}={}){
 if(typeof now!=='function'||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>5000||
   !Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>900000)fail('CACHE_CONFIG');
 const entries=new Map();
 const get=(route,config)=>{
  const key=publicAnswerCacheKey(route,config),item=entries.get(key),current=now();
  if(!Number.isSafeInteger(current))fail('CLOCK_INVALID');
  if(!item)return null;
  if(item.expiresAt<=current){entries.delete(key);return null;}
  return item.event;
 };
 const put=(route,config,event)=>{
  const key=publicAnswerCacheKey(route,config);verifyIssuedEvent(event,route);
  const current=now();if(!Number.isSafeInteger(current))fail('CLOCK_INVALID');
  if(entries.size>=maxEntries)entries.delete(entries.keys().next().value);
  entries.set(key,Object.freeze({event,expiresAt:current+ttlMs}));
  return key;
 };
 const purge=()=>{const count=entries.size;entries.clear();return count};
 return Object.freeze({get,put,purge,size:()=>entries.size});
}
export function publicFallback(reason){
 if(!['PROVIDER_UNAVAILABLE','PROVIDER_RATE_LIMITED','QUOTA_EXCEEDED','MODEL_CONFIG_REVOKED','CIRCUIT_OPEN'].includes(reason))
  fail('FALLBACK_REASON_INVALID');
 return Object.freeze({mode:'published_source_only',liveGenerationEnabled:false,
   readingEnabled:true,allowedContent:['source_text','curated_approved_cards'],
   reason,personalDataCached:false,automaticRetry:false});
}
export function createProviderCircuit({now=()=>Date.now(),failureThreshold=3,cooldownMs=30000}={}){
 if(typeof now!=='function'||!Number.isSafeInteger(failureThreshold)||
   failureThreshold<1||failureThreshold>20||!Number.isSafeInteger(cooldownMs)||
   cooldownMs<1000||cooldownMs>300000)fail('CIRCUIT_CONFIG');
 let failures=0,until=0,halfOpen=false;
 return Object.freeze({
  canAttempt(){
   const current=now();if(!Number.isSafeInteger(current))fail('CLOCK_INVALID');
   if(current<until)return false;
   if(until>0&&!halfOpen){halfOpen=true;return true;}
   return !halfOpen;
  },
  success(){failures=0;until=0;halfOpen=false;},
  failure(){
   const current=now();if(!Number.isSafeInteger(current))fail('CLOCK_INVALID');
   if(halfOpen||++failures>=failureThreshold){until=current+cooldownMs;halfOpen=false;}
  },
  state:()=>now()<until?'open':halfOpen?'half_open':'closed'
 });
}
