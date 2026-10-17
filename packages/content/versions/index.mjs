/** AB-021: immutable source-version status, freshness and pinned conversation boundaries. */
import {createHash} from 'node:crypto';
export class VersionError extends Error{constructor(code){super(code);this.code=code;this.name='VersionError';}}
const fail=c=>{throw new VersionError(c)};
const SHA=/^[a-f0-9]{64}$/,ID=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/;
const STATUS=new Set(['unknown','draft','introduced','amended','passed_one_chamber','enacted','effective','repealed']);
const TRANSITIONS={unknown:['draft','introduced','amended','passed_one_chamber','enacted'],draft:['introduced'],introduced:['amended','passed_one_chamber'],amended:['amended','passed_one_chamber','enacted'],passed_one_chamber:['amended','enacted'],enacted:['effective','repealed'],effective:['repealed'],repealed:[]};
const hash=s=>createHash('sha256').update(s).digest('hex');
function date(value){
 if(typeof value!=='string'||!(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/).test(value))fail('DATE_INVALID');
 const n=Date.parse(value),expected=value.includes('.')?value.replace(/\.(\d{1,3})Z$/,(m,d)=>'.'+d.padEnd(3,'0')+'Z'):value.replace(/Z$/,'.000Z');
 if(!Number.isFinite(n)||new Date(n).toISOString()!==expected)fail('DATE_INVALID');
 return value;
}
function officialSource(url){
 let u;try{u=new URL(url)}catch{fail('STATUS_SOURCE');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.searchParams.has('api_key')||u.search.length>500||!['api.congress.gov','www.congress.gov','www.govinfo.gov'].includes(u.hostname))fail('STATUS_SOURCE');
 if(u.hostname==='api.congress.gov'&&!/^\/v3\/bill\/\d{1,3}\/[a-z]+\/\d{1,6}/.test(u.pathname))fail('STATUS_SOURCE');
 return u.href;
}
export function newVersionSnapshot({versionId,billId,rawSha256,canonicalSha256,status='unknown',retrievedAt,sourceComplete=false}={}){
 if(typeof versionId!=='string'||!ID.test(versionId)||typeof billId!=='string'||!ID.test(billId)||!SHA.test(rawSha256)||!SHA.test(canonicalSha256)||!STATUS.has(status)||!['unknown','draft'].includes(status)||typeof sourceComplete!=='boolean')fail('VERSION_INPUT');
 const received=date(retrievedAt);
 return Object.freeze({versionId,billId,rawSha256,canonicalSha256,sourceComplete,retrievedAt:received,status,
  lastVerifiedAt:null,effectiveAt:null,enactedAt:null,statusHistory:Object.freeze([]),publication:'private',revision:0});
}
export function appendVerifiedStatus(version,{status,observedAt,sourceUrl,evidenceSha256,actionDate,effectiveAt=null,enactedAt=null}={}){
 if(!version||!Object.isFrozen(version)||!Array.isArray(version.statusHistory)||!STATUS.has(status)||status==='unknown'||!TRANSITIONS[version.status]?.includes(status)||!SHA.test(evidenceSha256))fail('STATUS_INVALID');
 const observed=date(observedAt),origin=officialSource(sourceUrl),action=date(actionDate);
 if(Date.parse(action)>Date.parse(observed)+86400000)fail('STATUS_FUTURE_ACTION');
 if(version.lastVerifiedAt&&Date.parse(observed)<Date.parse(version.lastVerifiedAt))fail('STATUS_STALE_UPDATE');
 let enacted=version.enactedAt,effective=version.effectiveAt;
 if(status==='enacted'){enacted=date(enactedAt??action);if(Date.parse(enacted)>Date.parse(observed)+86400000)fail('STATUS_FUTURE_ACTION');
  if(effectiveAt!==null){effective=date(effectiveAt);if(Date.parse(effective)<Date.parse(enacted))fail('EFFECTIVE_BEFORE_ENACTMENT');}}
 if(status==='effective'){
  if(!enacted)fail('ENACTMENT_REQUIRED');
  effective=date(effectiveAt??action);
  if(Date.parse(effective)<Date.parse(enacted))fail('EFFECTIVE_BEFORE_ENACTMENT');
  if(Date.parse(effective)>Date.parse(observed))fail('EFFECTIVE_IN_FUTURE');
 }
 if(status==='repealed'&&!enacted)fail('ENACTMENT_REQUIRED');
 const event=Object.freeze({from:version.status,to:status,observedAt:observed,actionDate:action,sourceUrl:origin,evidenceSha256,
   entryHash:hash(JSON.stringify([version.versionId,version.revision+1,status,observed,action,origin,evidenceSha256]))});
 return Object.freeze({...version,status,lastVerifiedAt:observed,enactedAt:enacted,effectiveAt:effective,
   revision:version.revision+1,statusHistory:Object.freeze([...version.statusHistory,event])});
}
export function evaluateVersionStatus(version,{now,staleAfterHours=24}={}){
 if(!version||!STATUS.has(version.status)||!Number.isSafeInteger(staleAfterHours)||staleAfterHours<1||staleAfterHours>720)fail('VERSION_INPUT');
 const timestamp=Date.parse(date(now)),verified=version.lastVerifiedAt?Date.parse(version.lastVerifiedAt):NaN;
 const stale=!Number.isFinite(verified)||timestamp-verified>staleAfterHours*3600000||timestamp<verified;
 let label=version.status.replaceAll('_',' '),uncertainty=[];
 if(version.status==='enacted'&&version.effectiveAt&&timestamp<Date.parse(version.effectiveAt))label='enacted but not effective';
 if(version.status==='effective'&&(!version.effectiveAt||timestamp<Date.parse(version.effectiveAt)))uncertainty.push('effective_date_unverified');
 if(!version.sourceComplete)uncertainty.push('incomplete_source');
 if(stale)uncertainty.push('status_verification_stale');
 if(version.status==='unknown')uncertainty.push('status_unknown');
 return Object.freeze({versionId:version.versionId,status:version.status,displayLabel:label,asOf:version.lastVerifiedAt,
   stale,uncertainty:Object.freeze(uncertainty),sourceComplete:version.sourceComplete});
}
export function switchPinnedVersion(session,target){
 if(!session||typeof session!=='object'||typeof session.versionId!=='string'||!Number.isSafeInteger(session.epoch)||session.epoch<0||!target||typeof target.versionId!=='string'||session.billId!==target.billId)fail('VERSION_SWITCH_INVALID');
 if(session.versionId===target.versionId)return Object.freeze({...session,switched:false});
 return Object.freeze({billId:target.billId,versionId:target.versionId,epoch:session.epoch+1,
  selectedSpan:null,answerIds:Object.freeze([]),tourPosition:null,audioId:null,cacheRevision:null,switched:true});
}
