/** AB-043: append-only test fixture for answer suppression and visible corrections. */
import {createHash} from 'node:crypto';
export class IncidentError extends Error{constructor(code){super(code);this.name='IncidentError';this.code=code;}}
const deny=c=>{throw new IncidentError(c)};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash=/^[a-f0-9]{64}$/;
const allowed=new Set(['fabricated_citation','wrong_enactment_status','missing_decisive_exception','unsafe_personal_advice','privacy_incident']);
function actorOK(actor,publisher){
 if(!actor||!uuid.test(actor.userId)||actor.publisherId!==publisher||actor.role!=='owner'||
   actor.authenticatedByTrustedServer!==true||actor.mfaRecentlyVerified!==true)deny('OWNER_AUTHORIZATION_REQUIRED');
 return actor.userId;
}
export function createIncidentLedger({publisherId,now=()=>Date.now()}={}){
 if(!uuid.test(publisherId)||typeof now!=='function')deny('LEDGER_CONFIG');
 const entries=[],blocked=new Map();
 const time=()=>{const n=now();if(!Number.isSafeInteger(n)||n<0)deny('CLOCK_INVALID');return new Date(n).toISOString();};
 return Object.freeze({
  suppress({versionId,answerTemplateSha256,reason,evidenceSha256,actor}={}){
   const owner=actorOK(actor,publisherId);
   if(typeof versionId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(versionId)||
      !hash.test(answerTemplateSha256)||!hash.test(evidenceSha256)||!allowed.has(reason))deny('INCIDENT_INPUT');
   const key=versionId+':'+answerTemplateSha256;
   if(blocked.has(key))return blocked.get(key).entry;
   const entry=Object.freeze({type:'answer.suppressed',publisherId,versionId,answerTemplateSha256,
     reason,evidenceSha256,actorId:owner,recordedAt:time(),sequence:entries.length+1,blocked:true});
   entries.push(entry);blocked.set(key,{entry,correction:null});return entry;
  },
  correct({versionId,answerTemplateSha256,correctedTextSourceHash,explanation,actor}={}){
   const owner=actorOK(actor,publisherId),key=versionId+':'+answerTemplateSha256;
   const old=blocked.get(key);
   if(!old||old.correction||!hash.test(correctedTextSourceHash)||
      typeof explanation!=='string'||!explanation.trim()||explanation.length>600||
      /<[^>]*>/.test(explanation))deny('CORRECTION_NOT_REVIEWED');
   const entry=Object.freeze({type:'answer.correction_published',publisherId,versionId,
     answerTemplateSha256,correctedTextSourceHash,
     publicNotice:explanation,actorId:owner,recordedAt:time(),
     sequence:entries.length+1,previousSequence:old.entry.sequence});
   entries.push(entry);blocked.set(key,{entry:old.entry,correction:entry});return entry;
  },
  publicState({versionId,answerTemplateSha256}={}){
   if(!hash.test(answerTemplateSha256)||typeof versionId!=='string')deny('ANSWER_ID');
   const record=blocked.get(versionId+':'+answerTemplateSha256);
   if(!record)return Object.freeze({status:'no_incident_recorded',hasPublicationApproval:false});
   return Object.freeze({status:'suppressed',visibleOriginalAnswer:false,reason:record.entry.reason,
     correctionNotice:record.correction?.publicNotice??null,
     originalAuditRetained:true});
  },
  auditEvents:()=>Object.freeze([...entries])
 });
}
