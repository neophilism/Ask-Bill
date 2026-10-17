/** AB-022: deterministic, explicitly nonauthoritative amendment previews. */
import {createHash} from 'node:crypto';
export class AmendmentError extends Error{constructor(code){super(code);this.name='AmendmentError';this.code=code;}}
const reject=c=>{throw new AmendmentError(c)};
const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const IDENT=/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,190}$/;
function stable(value){if(typeof value!=='string'||!IDENT.test(value))reject('INVALID_ID');return value;}
function text(value,max=500000){
 if(typeof value!=='string'||Array.from(value).length>max)reject('INVALID_TEXT');
 for(const c of value){const n=c.codePointAt(0);if(n>=0xd800&&n<=0xdfff)reject('INVALID_UNICODE');}
 return value;
}
const types=new Set(['insert','strike','replace','repeal','redesignate']);
function normalizedOp(op,provision){
 if(!op||typeof op!=='object'||!types.has(op.kind)||op.provisionId!==provision.id||op.versionId!==provision.versionId)reject('OPERATOR_SCOPE');
 const cp=Array.from(provision.text),start=op.start,end=op.end;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>cp.length)reject('RANGE_INVALID');
 const old=cp.slice(start,end).join(''),oldHash=hash(old);
 if(op.expectedOriginal!==old||op.expectedQuoteHash!==oldHash)reject('SOURCE_QUOTE_MISMATCH');
 if(op.kind==='insert'&&end!==start)reject('INSERT_RANGE');
 if(['strike','replace'].includes(op.kind)&&start===end)reject('EMPTY_RANGE');
 if(['repeal','redesignate'].includes(op.kind)&&(start!==0||end!==cp.length))reject('FULL_SOURCE_REQUIRED');
 if(!['insert','replace'].includes(op.kind)&&op.newText!==undefined)reject('INSERTION_FORBIDDEN');
 const newText=['insert','replace'].includes(op.kind)?text(op.newText,100000):'';
 if(op.kind==='redesignate'){
  stable(op.newProvisionId);
  if(op.newProvisionId===provision.id)reject('REDESIGNATE_SAME_ID');
 }else if(op.newProvisionId!==undefined)reject('REDESIGNATE_FORBIDDEN');
 if(op.kind==='insert'){
  const left=text(op.leftContext??'',100),right=text(op.rightContext??'',100);
  if(!left&&!right)reject('INSERT_CONTEXT_REQUIRED');
  if(!cp.slice(Math.max(0,start-Array.from(left).length),start).join('').endsWith(left)||
     !cp.slice(start,start+Array.from(right).length).join('').startsWith(right))reject('INSERT_CONTEXT_MISMATCH');
 }
 return Object.freeze({kind:op.kind,provisionId:op.provisionId,versionId:op.versionId,start,end,
   old,oldHash,newText,newProvisionId:op.newProvisionId??null});
}
export function previewAmendments({sourceVersionId,computedVersionId,provisions,operations}={}){
 stable(sourceVersionId);stable(computedVersionId);
 if(sourceVersionId===computedVersionId||!Array.isArray(provisions)||!provisions.length||provisions.length>20000||!Array.isArray(operations)||!operations.length||operations.length>2000)reject('AMENDMENT_INPUT');
 const lookup=new Map();for(const p of provisions){
  if(!p||typeof p!=='object'||stable(p.id)!==p.id||p.versionId!==sourceVersionId||lookup.has(p.id))reject('AMENDMENT_SOURCE');
  lookup.set(p.id,Object.freeze({id:p.id,versionId:sourceVersionId,text:text(p.text),originalHash:hash(p.text)}));
 }
 const bySource=new Map(),conflicts=[];
 for(const op of operations){
  if(!lookup.has(op?.provisionId))reject('UNKNOWN_PROVISION');
  let normalized;
  try{normalized=normalizedOp(op,lookup.get(op.provisionId));}
  catch(error){if(error instanceof AmendmentError){conflicts.push(Object.freeze({provisionId:op.provisionId,code:error.code}));continue;}throw error;}
  bySource.set(normalized.provisionId,[...(bySource.get(normalized.provisionId)??[]),normalized]);
 }
 const changed=[];
 for(const [id,list] of bySource){
  const original=lookup.get(id);
  const structural=list.filter(x=>['repeal','redesignate'].includes(x.kind));
  if(structural.length&&list.length>1){conflicts.push(Object.freeze({provisionId:id,code:'STRUCTURAL_COLLISION'}));continue;}
  let sorted=[...list].sort((a,b)=>a.start-b.start||a.end-b.end);
  for(let i=1;i<sorted.length;i++){
   const prev=sorted[i-1],next=sorted[i];
   if(next.start<prev.end||next.start===prev.start||next.start===prev.end&&(next.kind==='insert'||prev.kind==='insert')){
    conflicts.push(Object.freeze({provisionId:id,code:'OVERLAPPING_OPERATIONS'}));break;
   }
  }
  if(conflicts.some(c=>c.provisionId===id))continue;
  let result=Array.from(original.text),newId=id,removed=false;
  for(const op of sorted.reverse()){
   if(op.kind==='repeal'){result=[];removed=true;}
   else if(op.kind==='redesignate')newId=op.newProvisionId;
   else result.splice(op.start,op.end-op.start,...Array.from(op.newText));
  }
  changed.push(Object.freeze({id:newId,previousId:id,computedVersionId,sourceVersionId,sourceHash:original.originalHash,
    text:result.join(''),repealed:removed,computed:true}));
 }
 const resultIds=new Set([...lookup.keys()]);for(const p of changed)if(p.id!==p.previousId){
  if(resultIds.has(p.id))conflicts.push(Object.freeze({provisionId:p.previousId,code:'REDESIGNATE_COLLISION'}));
  resultIds.delete(p.previousId);resultIds.add(p.id);
 }
 if(conflicts.length)return Object.freeze({status:'blocked',sourceVersionId,computedVersionId,conflicts:Object.freeze(conflicts),
   provisions:null,publicationAllowed:false,authoritative:false});
 const updates=new Map(changed.map(x=>[x.previousId,x]));
 const results=[...lookup.values()].map(x=>updates.get(x.id)??Object.freeze({id:x.id,previousId:x.id,computedVersionId,
    sourceVersionId,sourceHash:x.originalHash,text:x.text,repealed:false,computed:true}));
 return Object.freeze({status:'computed_preview',sourceVersionId,computedVersionId,provisions:Object.freeze(results),
   conflicts:Object.freeze([]),publicationAllowed:false,authoritative:false,
   resultHash:hash(JSON.stringify(results.map(x=>[x.id,x.sourceHash,hash(x.text),x.repealed])))});
}
