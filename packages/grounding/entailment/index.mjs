/** AB-033: high-precision literal source review; paraphrases require a separate independent evaluator. */
import {createHash} from 'node:crypto';
import {verifyValidatedSegment} from '@ask-bill/contracts';
export class EntailmentError extends Error{constructor(code){super(code);this.code=code;this.name='EntailmentError';}}
const fail=c=>{throw new EntailmentError(c)};
const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))deepFreeze(v);Object.freeze(value);}return value;}
function reviewRequired(reason,versionId){return Object.freeze({status:'needs_semantic_review',reason,versionId,
  semanticEntailmentVerified:false,displayAllowed:false,spokenAllowed:false});}
export async function evaluateLiteralSupport({held,evidence}={}){
 if(!held||held.status!=='awaiting_semantic_review'||held.sourcesVerified!==true||held.displayAllowed!==false||
   !held.segment||typeof held.documentVersion!=='string'||!evidence||evidence.status!=='source_evidence'||
   evidence.versionId!==held.documentVersion||!Array.isArray(evidence.included)||evidence.included.length<1)fail('REVIEW_INPUT');
 const entries=new Map();for(const s of evidence.included){
  if(!s||typeof s.provisionId!=='string'||s.versionId!==held.documentVersion||typeof s.text!=='string'||
    s.sha256!==hash(s.text)||entries.has(s.provisionId))fail('SOURCE_INTEGRITY');
  entries.set(s.provisionId,s);
 }
 if(evidence.truncated)return reviewRequired('EVIDENCE_TRUNCATED',held.documentVersion);
 if((evidence.unresolvedReferences?.length??0)>0)return reviewRequired('UNRESOLVED_REFERENCES',held.documentVersion);
 const claims=held.segment.claims;if(!Array.isArray(claims)||!claims.length||claims.length>20)fail('CLAIM_INPUT');
 if(claims.some(c=>c.kind!=='bill_text'||c.support!=='qualified'||!Array.isArray(c.spans)||c.spans.length!==1))return reviewRequired('MATERIAL_INTERPRETATION_REQUIRED',held.documentVersion);
 const expected=claims.map(c=>c.text).join('\n\n');
 if(held.segment.text!==expected)return reviewRequired('UNREVIEWED_PARAPHRASE',held.documentVersion);
 for(const c of claims){
  const span=c.spans[0],record=entries.get(span.provisionId);
  if(!record||span.sourceVersionId!==held.documentVersion)return reviewRequired('CITATION_OUT_OF_SCOPE',held.documentVersion);
  if(c.text!==span.quote)return reviewRequired('UNREVIEWED_PARAPHRASE',held.documentVersion);
  const actual=Array.from(record.text).slice(span.start,span.end).join('');
  if(actual!==span.quote||span.quoteHash!==hash(actual))return reviewRequired('TAMPERED_CITATION',held.documentVersion);
 }
 for(const m of evidence.exceptionMarkers??[]){
  const source=entries.get(m.sourceId);if(!source)return reviewRequired('EXCEPTION_SOURCE_MISSING',held.documentVersion);
  const covered=claims.some(c=>c.spans.some(s=>s.provisionId===m.sourceId&&s.start===0&&s.end===Array.from(source.text).length));
  if(!covered)return reviewRequired('DECISIVE_EXCEPTION_NOT_CITED',held.documentVersion);
 }
 const segment={...held.segment,claims:claims.map(c=>({...c,support:'supported',qualifications:['Verbatim quotation only; no independent interpretation or current-law status is asserted.']})),
  validation:{...held.segment.validation,validatorConfig:hash('ask-bill:ab033:literal-only-v1')}};
 try{await verifyValidatedSegment(segment,held.documentVersion,id=>entries.get(id)?.text);}
 catch{return reviewRequired('CITATION_VALIDATION_FAILED',held.documentVersion);}
 return Object.freeze({status:'verified_verbatim_source_only',documentVersion:held.documentVersion,segment:deepFreeze(segment),
  semanticEntailmentVerified:true,entailmentMethod:'exact_verbatim',displayAllowed:true,spokenAllowed:false,
  supportsLegalInterpretation:false,requiresSourceLabel:true,requiresStatusLabel:true});
}
