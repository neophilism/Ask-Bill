/** AB-032: deterministic citation construction from untrusted provider draft proposals. */
import {createHash} from 'node:crypto';
import {makeExactQuoteSpan} from '../../content/anchors/index.mjs';
import {verifyValidatedSegment} from '@ask-bill/contracts';
export class ClaimGateError extends Error{constructor(code){super(code);this.code=code;this.name='ClaimGateError';}}
const fail=c=>{throw new ClaimGateError(c)};
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const validKinds=new Set(['bill_text','interpretation','hypothetical','attributed_position','unknown']);
const keys=new Set(['kind','sourceId','quote','occurrence','claimText','attribution']);
function freezeDeep(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freezeDeep(v);Object.freeze(x);}return x;}
function sourceInventory(route,evidence){
 if(!route||route.status!=='allowed'||route.sourcePublished!==true||!route.noModelToolExecution||
  !evidence||evidence.status!=='source_evidence'||evidence.publisherId!==route.publisherId||evidence.versionId!==route.versionId||
  !Array.isArray(evidence.included)||!evidence.included.length||evidence.included.length>80||
  typeof evidence.configSha256!=='string'||!/^[a-f0-9]{64}$/.test(evidence.configSha256))fail('UNAPPROVED_EVIDENCE');
 const lookup=new Map();
 for(const s of evidence.included){
  if(!s||typeof s.provisionId!=='string'||typeof s.text!=='string'||s.versionId!==route.versionId||
   !/^[a-f0-9]{64}$/.test(s.sha256)||sha(s.text)!==s.sha256||lookup.has(s.provisionId))fail('EVIDENCE_TAMPERED');
  lookup.set(s.provisionId,s);
 }
 return lookup;
}
export async function validateClaimDraft({route,evidence,draft,validatedAt,promptConfigSha256}={}){
 const sources=sourceInventory(route,evidence);
 if(!draft||draft.type!=='untrusted_draft'||draft.noCitationAuthority!==true||draft.verificationRequired!==true||
    draft.versionId!==route.versionId||typeof draft.text!=='string'||draft.text.length>5000||
    !Array.isArray(draft.claims)||draft.claims.length<1||draft.claims.length>20)fail('UNTRUSTED_DRAFT_REQUIRED');
 if(typeof validatedAt!=='string'||!Number.isFinite(Date.parse(validatedAt))||new Date(validatedAt).toISOString()!==validatedAt||
  typeof promptConfigSha256!=='string'||!/^[a-f0-9]{64}$/.test(promptConfigSha256))fail('VALIDATION_METADATA');
 const built=[];
 for(let index=0;index<draft.claims.length;index++){
  const proposal=draft.claims[index];
  if(!proposal||typeof proposal!=='object'||Object.keys(proposal).some(k=>!keys.has(k))||!validKinds.has(proposal.kind))fail('CLAIM_SCHEMA');
  if(typeof proposal.claimText!=='string'||!proposal.claimText.trim()||proposal.claimText.length>4000)fail('CLAIM_TEXT');
  const id='claim-'+String(index+1);
  if(proposal.kind==='unknown'){
   if(proposal.quote!==undefined||proposal.sourceId!==undefined)fail('UNKNOWN_HAS_CITATION');
   built.push({id,kind:'unknown',text:proposal.claimText,support:'unavailable',spans:[],qualifications:['The available bill text does not establish this answer.']});
   continue;
  }
  if(typeof proposal.sourceId!=='string'||!sources.has(proposal.sourceId)||typeof proposal.quote!=='string'||!proposal.quote||proposal.quote.length>4000)fail('CITATION_NOT_AUTHORIZED');
  const src=sources.get(proposal.sourceId);
  if(proposal.kind==='attributed_position'&&(typeof proposal.attribution!=='string'||!proposal.attribution.trim()||proposal.attribution.length>200))fail('ATTRIBUTION_REQUIRED');
  if(proposal.kind!=='attributed_position'&&proposal.attribution!==undefined)fail('ATTRIBUTION_FORBIDDEN');
  let exact;
  try{
   exact=makeExactQuoteSpan({versionId:route.versionId,provisionId:proposal.sourceId,sourceText:src.text,quote:proposal.quote,
    citationLabel:'Provision '+proposal.sourceId,occurrence:proposal.occurrence,originalLocator:{}});
  }catch{fail('SOURCE_QUOTE_NOT_EXACT');}
  const claim={id,kind:proposal.kind,text:proposal.claimText,support:'qualified',
   spans:[exact.span],qualifications:['Exact quotation verified; claim meaning and decisive exceptions require independent support review.']};
  if(proposal.kind==='attributed_position')claim.attribution=proposal.attribution;
  built.push(claim);
 }
 const validatorConfigSha256=sha('ask-bill:ab032:source-only:validator-v1');
 const object={id:'segment-1',text:draft.text,claimIds:built.map(x=>x.id),claims:built,versionId:route.versionId,
  validation:{schema:'v1',retrievalConfig:evidence.configSha256,promptConfig:promptConfigSha256,validatorConfig:validatorConfigSha256,validatedAt}};
 let verified;
 try{verified=await verifyValidatedSegment(object,route.versionId,id=>sources.get(id)?.text);}
 catch{fail('EXACT_SPAN_VERIFICATION_FAILED');}
 const exceptionFlag=(evidence.exceptionMarkers?.length??0)>0||evidence.truncated===true||(evidence.unresolvedReferences?.length??0)>0;
 return Object.freeze({status:'awaiting_semantic_review',documentVersion:route.versionId,segment:freezeDeep(verified),
  sourcesVerified:true,exceptionReviewRequired:exceptionFlag,
  semanticEntailmentVerified:false,displayAllowed:false,spokenAllowed:false});
}
