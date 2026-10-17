/** AB-019: conservative typed source relationships. Heuristics are never legal conclusions. */
import {createHash} from 'node:crypto';
export class RelationError extends Error{constructor(code){super(code);this.code=code;this.name='RelationError';}}
const fail=c=>{throw new RelationError(c)};
const cp=s=>Array.from(s).length;
const SHA=s=>createHash('sha256').update(s).digest('hex');
const numberFrom=p=>{
 const x=(p.label??'').match(/(?:^|\b)(?:sec\.?|section)\s*([0-9]+[a-z]?)/i)||p.id.match(/(?:^|\/|-)sec(?:tion)?[-_]?([0-9]+[a-z]?)(?:$|[-_/])/i);
 return x?.[1]?.toLowerCase()??null;
};
const REF=/(?:\bsection|\bsec\.)\s+([0-9]+[a-z]?)(?:\(([a-z0-9]+)\))?/gi;
const DEF=/(?:the term\s+)?["“]([^"”]{1,80})["”]\s+(?:means|shall mean|includes)\b/gi;
const EXCEPT=/\b(?:except\s+(?:as|when|for)|unless|notwithstanding|subject to|provided that)\b/gi;
const TIMING=/\b(?:not later than|within\s+\d{1,4}\s+(?:days?|months?|years?)|effective\s+(?:on|after)|beginning\s+on|as of)\b/gi;
function span(text,match){
 const start=cp(text.slice(0,match.index)),quote=match[0];
 return Object.freeze({start,end:start+cp(quote),quote,quoteHash:SHA(quote)});
}
export function buildRelationGraph({versionId,provisions}={}){
 if(typeof versionId!=='string'||!versionId.trim()||versionId.length>120||!Array.isArray(provisions)||provisions.length>50000)fail('GRAPH_INPUT');
 const nodes=[],ids=new Set(),sections=new Map();
 for(const p of provisions){
  if(!p||typeof p!=='object'||p.versionId!==versionId||typeof p.id!=='string'||!p.id||p.id.length>200||ids.has(p.id)||typeof p.text!=='string'||cp(p.text)>500000)fail('GRAPH_PROVISION');
  ids.add(p.id);
  const n=Object.freeze({id:p.id,versionId,kind:p.kind??'provision',textHash:SHA(p.text),label:p.label??null,heading:p.heading??null,text:p.text});
  nodes.push(n);
  if(n.kind==='section'){
   const key=numberFrom(n);if(key)sections.set(key,[...(sections.get(key)??[]),n.id]);
  }
 }
 const edges=[],unresolved=[],definitions=[],exceptions=[],timing=[];
 for(const n of nodes){
  for(const m of n.text.matchAll(DEF))definitions.push(Object.freeze({term:m[1],sourceId:n.id,span:span(n.text,m)}));
  for(const m of n.text.matchAll(EXCEPT))exceptions.push(Object.freeze({sourceId:n.id,span:span(n.text,m),needsReview:true}));
  for(const m of n.text.matchAll(TIMING))timing.push(Object.freeze({sourceId:n.id,span:span(n.text,m),noCalculatedDeadline:true}));
  for(const m of n.text.matchAll(REF)){
   const section=m[1].toLowerCase(),candidates=sections.get(section)??[];
   if(candidates.length!==1){
    unresolved.push(Object.freeze({from:n.id,citedSection:section,status:candidates.length?'ambiguous':'unresolved',candidates:Object.freeze([...candidates]),span:span(n.text,m)}));
   }else{
    edges.push(Object.freeze({kind:'internal_reference',from:n.id,to:candidates[0],span:span(n.text,m),versionId}));
   }
  }
 }
 // Definition expansions use exact boundaries; collisions remain unresolved.
 const defsByTerm=new Map();
 for(const d of definitions){const key=d.term.toLocaleLowerCase('en-US');defsByTerm.set(key,[...(defsByTerm.get(key)??[]),d]);}
 for(const n of nodes)for(const [term,candidates] of defsByTerm){
  if(candidates.every(d=>d.sourceId===n.id))continue;
  if(term.length<3)continue;
  const lower=n.text.toLocaleLowerCase('en-US'),pos=lower.indexOf(term);
  if(pos<0)continue;
  const prev=pos>0?lower[pos-1]:'',next=lower[pos+term.length]??'';
  if((prev&&/[\p{L}\p{N}_]/u.test(prev))||(next&&/[\p{L}\p{N}_]/u.test(next)))continue;
  const external=candidates.filter(d=>d.sourceId!==n.id);
  if(external.length===1)edges.push(Object.freeze({kind:'definition',from:n.id,to:external[0].sourceId,term,versionId}));
  else if(external.length>1)unresolved.push(Object.freeze({from:n.id,status:'ambiguous_definition',term,candidates:Object.freeze(external.map(x=>x.sourceId))}));
 }
 return Object.freeze({versionId,nodes:Object.freeze(nodes),edges:Object.freeze(edges),definitions:Object.freeze(definitions),
  exceptions:Object.freeze(exceptions),timing:Object.freeze(timing),unresolved:Object.freeze(unresolved),publicationAllowed:false});
}
export function expandEvidenceGraph(graph,seedIds,{maxDepth=2,maxNodes=40}={}){
 if(!graph||typeof graph.versionId!=='string'||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||!Array.isArray(seedIds)||seedIds.length>40||
    !Number.isSafeInteger(maxDepth)||maxDepth<0||maxDepth>6||!Number.isSafeInteger(maxNodes)||maxNodes<1||maxNodes>200)fail('GRAPH_INPUT');
 const byId=new Map(graph.nodes.map(n=>[n.id,n]));
 const visited=new Set(),pending=seedIds.map(id=>({id,depth:0}));for(const x of pending)if(!byId.has(x.id))fail('GRAPH_SOURCE_MISSING');
 for(let i=0;i<pending.length;i++){
  const {id,depth}=pending[i];if(visited.has(id))continue;
  if(visited.size>=maxNodes)break;visited.add(id);
  if(depth>=maxDepth)continue;
  for(const e of graph.edges)if(e.from===id&&byId.has(e.to)&&!visited.has(e.to))pending.push({id:e.to,depth:depth+1});
 }
 return Object.freeze({versionId:graph.versionId,selected:Object.freeze([...visited]),sources:Object.freeze([...visited].map(id=>byId.get(id))),
  exceptions:Object.freeze(graph.exceptions.filter(x=>visited.has(x.sourceId))),
  unresolved:Object.freeze(graph.unresolved.filter(x=>visited.has(x.from))),truncated:pending.some(x=>!visited.has(x.id))});
}
