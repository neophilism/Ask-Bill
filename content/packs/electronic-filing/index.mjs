/** AB-025: exact, intentionally incomplete, offline electronic-filing reference pack. */
import {createHash} from 'node:crypto';
export class ReferencePackError extends Error{constructor(code){super(code);this.name='ReferencePackError';this.code=code;}}
const fail=c=>{throw new ReferencePackError(c)};
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const PINNED_EXCERPT_SHA256='40e08e04859636979f5e0c55131460893729e873d3e76524475aab2d285e15ea';
const questions=Object.freeze([
 Object.freeze({id:'receipt_rule',label:'What does this draft say about receipt time?',
  status:'verbatim_only',response:'The excerpt says that the legally effective receipt time is when a submission first enters an authorized Federal intake system. The supplied sentence stops before its next qualification; this is a draft excerpt, not an enacted legal rule.'}),
 Object.freeze({id:'employee_read',label:'Does receipt wait until someone opens it?',
  status:'source_incomplete',response:'The excerpt mentions entry into an authorized intake system, but ends immediately after “and not the time at which—”. It does not supply the missing comparison or establish an employee-reading rule.'}),
 Object.freeze({id:'wrong_agency',label:'What if it reaches the wrong federal agency?',
  status:'source_incomplete',response:'This excerpt does not include routing, wrong-agency or transfer provisions. The full selected draft and definitions are needed.'}),
 Object.freeze({id:'correction',label:'Can a claimant correct a submitted filing?',
  status:'source_incomplete',response:'Correction and resubmission procedures are absent from the supplied fragment; no rule can be inferred.'}),
 Object.freeze({id:'definitions',label:'Which submissions and systems are covered?',
  status:'source_incomplete',response:'The opening sections and defined terms are not available. The identity of an authorized Federal intake system cannot be determined here.'}),
 Object.freeze({id:'deadline',label:'Does this establish my filing deadline?',
  status:'personal_case_unknown',response:'This incomplete draft cannot determine a person’s filing deadline or whether a statute is currently effective. Consult the complete authoritative law and qualified legal advice for a case-specific question.'})
]);
export function createElectronicFilingPack(fixture){
 if(!fixture||typeof fixture!=='object'||Array.isArray(fixture)||
    fixture.fixtureOnly!==true||fixture.publicationAllowed!==false||fixture.sourceComplete!==false||
    fixture.status!=='draft'||fixture.provisionLabel!=='Draft section 4203 subsection d'||
    typeof fixture.text!=='string'||sha(fixture.text)!==PINNED_EXCERPT_SHA256)fail('ORIGINAL_EXCERPT_MISMATCH');
 const quote=fixture.text,span=Object.freeze({start:0,end:Array.from(quote).length,
   quote,quoteHash:PINNED_EXCERPT_SHA256,citationLabel:fixture.provisionLabel,sourceComplete:false});
 return Object.freeze({packId:'electronic-filing-excerpt-reference-v1',kind:'incomplete_private_fixture',
   sourceStatus:'draft',sourceComplete:false,publicationAllowed:false,
   originalExcerptSha256:PINNED_EXCERPT_SHA256,originalSpan:span,
   missing:Object.freeze(['opening_sections','definitions','following_clause','authenticated_full_version']),
   questions});
}
export function explainFixtureQuestion(pack,questionId){
 if(!pack||pack.kind!=='incomplete_private_fixture'||pack.originalExcerptSha256!==PINNED_EXCERPT_SHA256||
    pack.publicationAllowed!==false||pack.sourceComplete!==false)fail('PACK_NOT_TRUSTED');
 const question=questions.find(x=>x.id===questionId);
 if(!question)return Object.freeze({status:'not_supported',text:'This limited draft fragment cannot answer that question.',citations:Object.freeze([])});
 return Object.freeze({id:question.id,status:question.status,text:question.response,
   citations:Object.freeze(question.id==='receipt_rule'||question.id==='employee_read'?[pack.originalSpan]:[]),
   sourceCompleteness:'incomplete',isCurrentLaw:false,caseSpecificAdvice:false});
}
/** Never promote this fixture into a public release; import a complete authenticated version separately. */
export function assertPublishablePack(pack){if(!pack||pack.kind==='incomplete_private_fixture'||pack.sourceComplete!==true)fail('COMPLETE_AUTHENTICATED_SOURCE_REQUIRED');return false;}
