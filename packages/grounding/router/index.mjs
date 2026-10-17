/** AB-029: deterministic, server-authorized question routing; never a legal decision. */
import {createHash} from 'node:crypto';
export class RouterError extends Error{constructor(code){super(code);this.code=code;this.name='RouterError';}}
const deny=code=>{throw new RouterError(code)};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const date=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const classify=q=>{
 if(/\b(?:my case|my lawsuit|my (?:claim|filing|deadline|injury)|should i (?:file|sue|sign|appeal)|am i eligible|will i (?:win|qualify))\b/i.test(q))return 'personal_application';
 if(/\b(?:ignore (?:previous|all) instructions|reveal (?:system|secrets|your prompt)|send (?:your|the) (?:api key|token)|execute (?:code|command)|run (?:shell|javascript))\b/i.test(q))return 'unsafe_request';
 if(/\b(?:what (?:if|would happen if)|suppose|hypothetical|imagine that)\b/i.test(q))return 'hypothetical';
 if(/\b(?:how much will|will (?:cost|increase|decrease)|predict|forecast|project(?:ed|ions)?|estimate the (?:cost|impact))\b/i.test(q))return 'prediction';
 if(/\b(?:current law|existing law|law today|already legal|is it (?:legal|illegal) (?:now|today)|what does (?:the )?law (?:currently|now))\b/i.test(q))return 'current_law';
 if(/\b(?:opposition|opponents|critics|supporters|sponsor|argue|objections?)\b/i.test(q))return 'attributed_position';
 return 'bill_explanation';
};
function uuid(value){if(typeof value!=='string'||!UUID.test(value))deny('INVALID_ID');return value.toLowerCase()}
function question(raw){
 if(typeof raw!=='string'||Array.from(raw).length>2000)deny('QUESTION_LIMIT');
 const trimmed=raw.trim();
 if(Array.from(trimmed).length<3)deny('QUESTION_EMPTY');
 for(const c of trimmed){let n=c.codePointAt(0);if(n>=0xd800&&n<=0xdfff||n<32&&n!==10)deny('QUESTION_CONTROL');}
 return trimmed;
}
/** A trusted DB resolver must return the source version scoped to the server publisher context. */
export function createQuestionRouter({trustedPublisherId,resolveVersion,allowCurrentLaw=false,allowPublisherPreview=false}={}){
 const pub=uuid(trustedPublisherId);
 if(typeof resolveVersion!=='function'||typeof allowCurrentLaw!=='boolean'||typeof allowPublisherPreview!=='boolean')deny('ROUTER_CONFIG');
 return Object.freeze({
  async route({publisherId,versionId,question:raw,ageBand='unknown',readingLevel='standard',selectedSpan=null}={}){
   if(uuid(publisherId)!==pub)deny('TENANT_FORBIDDEN');
   const ver=uuid(versionId),q=question(raw);
   if(!['adult','13-17','under-13','unknown'].includes(ageBand)||!['simple','standard','concise'].includes(readingLevel))deny('PREFERENCE_INVALID');
   const source=await resolveVersion(pub,ver);
   if(!source||source.publisherId!==pub||source.versionId!==ver||!['published','reviewed','private'].includes(source.publication)||typeof source.sourceComplete!=='boolean')deny('SOURCE_NOT_AUTHORIZED');
   const isPublished=source.publication==='published'&&source.sourceComplete===true;
   if(!isPublished&&!(allowPublisherPreview&&source.authorizedPublisher===true))deny('SOURCE_NOT_PUBLISHED');
   const selection=selectedSpan===null?null:(()=>{if(!selectedSpan||selectedSpan.versionId!==ver||typeof selectedSpan.provisionId!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/).test(selectedSpan.provisionId)||
    !Number.isSafeInteger(selectedSpan.start)||!Number.isSafeInteger(selectedSpan.end)||selectedSpan.start<0||selectedSpan.end<=selectedSpan.start)deny('SELECTION_INVALID');return Object.freeze({versionId:ver,provisionId:selectedSpan.provisionId,start:selectedSpan.start,end:selectedSpan.end});})();
   const category=classify(q),ageRestricted=ageBand==='under-13'||ageBand==='unknown',scope=Object.freeze([ver]);
   let status='allowed',reason=null,tools=['read_selected_version'];
   if(ageRestricted){status='curated_only';reason='AGE_CONSENT_REQUIRED';tools=[];}
   else if(category==='personal_application'){status='source_only';reason='PERSONAL_LEGAL_ADVICE_OUT_OF_SCOPE';tools=[];}
   else if(category==='unsafe_request'){status='source_only';reason='UNSAFE_TOOL_INSTRUCTION';tools=[];}
   else if(category==='current_law'&&!allowCurrentLaw){status='source_only';reason='CURRENT_LAW_NOT_VERIFIED';tools=[];}
   else if(category==='current_law'){tools=['read_selected_version','read_verified_current_law'];}
   else if(!isPublished){status='publisher_preview_only';reason='PRIVATE_DRAFT_NOT_AUTHORITY';tools=['read_selected_private_version'];}
   return Object.freeze({publisherId:pub,versionId:ver,sourcePublished:isPublished,sourceComplete:source.sourceComplete,
    category,status,reason,allowedVersionIds:scope,allowedReadTools:Object.freeze(tools),
    readingLevel,selectedSpan:selection,
    questionSha256:createHash('sha256').update(q).digest('hex'),questionLength:Array.from(q).length,
    currentLawAllowed:status==='allowed'&&category==='current_law'&&allowCurrentLaw,
    noModelToolExecution:true,notLegalAdvice:true});
  }
 });
}
