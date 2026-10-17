/** AB-039: evidence-labelled draft explanations and attributed disagreement. */
import {createHash} from 'node:crypto';
export class PerspectiveError extends Error{constructor(code){super(code);this.name='PerspectiveError';this.code=code;}}
const deny=c=>{throw new PerspectiveError(c)};
const sha=t=>createHash('sha256').update(t,'utf8').digest('hex'),hex=/^[a-f0-9]{64}$/;
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,190}$/.test(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const validStance=new Set(['support','oppose','concern','qualified','neutral']);
const validUnknowns=new Set(['no_independent_source','ambiguous_text','unresolved_exception','unknown_current_law','prediction_without_method','missing_published_position']);
export function quotedProvisions({versionId,provisions,selected}={}){
 if(!id(versionId)||!Array.isArray(provisions)||!provisions.length||provisions.length>100||
   !Array.isArray(selected)||!selected.length||selected.length>25)deny('SOURCE_SET');
 const sources=new Map();
 for(const source of provisions){
  if(!source||source.versionId!==versionId||!id(source.provisionId)||typeof source.text!=='string'||
     !source.text||source.text.length>100000||!hex.test(source.sha256)||sha(source.text)!==source.sha256||
     sources.has(source.provisionId))deny('SOURCE_INTEGRITY');
  sources.set(source.provisionId,source);
 }
 const spans=[];
 for(const s of selected){
  const source=sources.get(s.provisionId);
  if(!source||s.versionId!==versionId||!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||
     s.start<0||s.end<=s.start||s.end>Array.from(source.text).length)deny('SOURCE_RANGE');
  const quote=Array.from(source.text).slice(s.start,s.end).join('');
  if(quote!==s.quote||s.quoteHash!==sha(quote))deny('CITATION_TAMPERED');
  spans.push(Object.freeze({versionId,provisionId:s.provisionId,quote,
    start:s.start,end:s.end,quoteHash:s.quoteHash}));
 }
 return Object.freeze(spans);
}
function safePosition(p,versionId){
 if(!p||typeof p!=='object'||Array.isArray(p)||!validStance.has(p.stance)||
    typeof p.speaker!=='string'||!p.speaker.trim()||p.speaker.length>200||
    typeof p.statement!=='string'||!p.statement.trim()||p.statement.length>3000||
    !p.record||typeof p.record!=='object'||p.record.versionId!==versionId||
    typeof p.record.canonicalText!=='string'||!p.record.canonicalText.includes(p.statement)||
    typeof p.record.sha256!=='string'||!hex.test(p.record.sha256)||
    sha(p.record.canonicalText)!==p.record.sha256||!date(p.record.asOf))deny('ATTRIBUTION_NOT_VERIFIED');
 let uri;try{uri=new URL(p.record.sourceUrl);}catch{deny('ATTRIBUTION_URL');}
 if(uri.protocol!=='https:'||uri.username||uri.password||uri.hash||uri.port||!uri.hostname)deny('ATTRIBUTION_URL');
 return Object.freeze({speaker:p.speaker,stance:p.stance,statement:p.statement,
   sourceUrl:uri.toString(),asOf:p.record.asOf,sourceHash:p.record.sha256,
   label:'Attributed public position; not authoritative bill text',
   prediction:/(?:will|would|might|could)\s+(?:cost|increase|decrease|save)\s+\$?\d/i.test(p.statement)?
     'Estimate attributed to speaker; no independent quantitative verification':null});
}
export function buildPerspectiveBrief({bill,provisions,selected,positions=[],unknowns=[]}={}){
 if(!bill||!id(bill.versionId)||!['introduced','amended','draft','passed_one_chamber'].includes(bill.status)||
    bill.publication!=='published'||bill.sourceComplete!==true)deny('PUBLISHED_DRAFT_REQUIRED');
 if(!Array.isArray(positions)||positions.length>20||!Array.isArray(unknowns)||unknowns.length>20||
    unknowns.some(x=>!validUnknowns.has(x)))deny('POSITION_SCOPE');
 const citations=quotedProvisions({versionId:bill.versionId,provisions,selected});
 const views=positions.map(p=>safePosition(p,bill.versionId));
 return Object.freeze({kind:'nonadvocacy_source_brief',versionId:bill.versionId,
   sourceStatus:bill.status,sourceCitationLabel:'Exact text of proposed legislation; not current law',
   quotations:citations,positions:Object.freeze(views),
   unknowns:Object.freeze([...new Set(unknowns),...(views.length===0?['missing_published_position']:[])]),
   caveat:'Quoted legislation and attributed reactions are different evidence types. Missing viewpoints are not fabricated. No prediction or disputed interpretation is treated as enacted law.'});
}
export function escapePerspectiveText(value){
 if(typeof value!=='string'||value.length>20000)deny('RENDER_LIMIT');
 return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
