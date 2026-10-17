/** AB-031: exact source-bound lexical evidence retrieval, no LLM or private corpus. */
import {createHash} from 'node:crypto';
import {searchGeneration} from '../../content/search/index.mjs';
import {expandEvidenceGraph} from '../../content/references/index.mjs';
export class RetrievalError extends Error{constructor(code){super(code);this.code=code;this.name='RetrievalError';}}
const fail=code=>{throw new RetrievalError(code)};
const sha=t=>createHash('sha256').update(t).digest('hex');
const limits=(x,lo,hi)=>Number.isSafeInteger(x)&&x>=lo&&x<=hi;
export function retrieveEvidence({route,index,graph,question,maxSeeds=5,maxSources=25,depth=2}={}){
 if(!route||route.status!=='allowed'||route.sourcePublished!==true||route.category==='current_law'||
   route.noModelToolExecution!==true||!Array.isArray(route.allowedVersionIds)||route.allowedVersionIds.length!==1||
   route.allowedVersionIds[0]!==route.versionId||typeof question!=='string'||sha(question.trim())!==route.questionSha256)
  fail('RETRIEVAL_NOT_AUTHORIZED');
 if(!index||index.state!=='complete'||index.publisherId!==route.publisherId||index.versionId!==route.versionId||
   !graph||graph.versionId!==route.versionId||graph.publicationAllowed!==false)fail('CORPUS_SCOPE');
 if(!limits(maxSeeds,1,15)||!limits(maxSources,1,80)||!limits(depth,0,6))fail('RETRIEVAL_BOUNDS');
 const all=new Map(index.entries.map(x=>[x.provisionId,x]));
 if(!Array.isArray(graph.nodes)||graph.nodes.some(n=>!all.has(n.id)||sha(n.text)!==all.get(n.id).textSha256||
   n.versionId!==route.versionId))fail('INDEX_SOURCE_MISMATCH');
 let search;try{search=searchGeneration(index,{publisherId:route.publisherId,versionId:route.versionId,query:question,limit:maxSeeds});}
 catch{fail('SEARCH_REJECTED');}
 const ranked=search.results.map(x=>x.provisionId);
 // If lexical search is inconclusive, no invented evidence or arbitrary corpus fallback.
 if(!ranked.length)return Object.freeze({status:'no_evidence',publisherId:route.publisherId,versionId:route.versionId,
  included:Object.freeze([]),unresolvedReferences:Object.freeze([]),exceptionMarkers:Object.freeze([]),
  sourceHashes:Object.freeze([]),questionSha256:route.questionSha256,configSha256:sha('lexical-v1:no-evidence'),
  publicationAllowed:false});
 const expand=expandEvidenceGraph(graph,ranked,{maxDepth:depth,maxNodes:maxSources});
 const queue=[...expand.selected],seen=new Set(queue);
 // Include structural parent clauses and directly nested exceptions so a section-level
 // search cannot quote an obligation without its exception hierarchy.
 for(let i=0;i<queue.length&&queue.length<maxSources;i++){
  const sourceId=queue[i],parts=sourceId.split('/');
  if(parts.length>1){const parent=parts.slice(0,-1).join('/');if(all.has(parent)&&!seen.has(parent)){seen.add(parent);queue.push(parent);}}
  for(const n of graph.nodes){
   if(queue.length>=maxSources)break;
   if(n.id.startsWith(sourceId+'/')&&n.id.slice(sourceId.length+1).indexOf('/')===-1&&!seen.has(n.id)){
    if(graph.exceptions.some(x=>x.sourceId===n.id)){seen.add(n.id);queue.push(n.id);}
   }
  }
 }
 const included=[];
 for(const id of queue){
  const match=all.get(id);if(!match)fail('RETRIEVAL_SOURCE_MISSING');
  const source=graph.nodes.find(x=>x.id===id);
  if(!source||sha(match.text)!==source.textHash||match.publisherId!==route.publisherId||match.versionId!==route.versionId)fail('RETRIEVAL_INTEGRITY');
  included.push(Object.freeze({provisionId:id,versionId:route.versionId,sha256:match.textSha256,
   text:match.text,codePoints:Array.from(match.text).length,start:0,end:Array.from(match.text).length}));
 }
 const exceptionMarkers=graph.exceptions.filter(x=>seen.has(x.sourceId)).map(x=>Object.freeze({sourceId:x.sourceId,span:x.span,needsReview:true}));
 const unresolvedReferences=graph.unresolved.filter(x=>seen.has(x.from)).map(x=>Object.freeze(x));
 const hashes=included.map(x=>x.sha256);
 const configSha256=sha(JSON.stringify({index:index.generationHash,versionId:route.versionId,maxSeeds,maxSources,depth,
  selected:included.map(x=>x.provisionId),markerCount:exceptionMarkers.length}));
 return Object.freeze({status:'source_evidence',publisherId:route.publisherId,versionId:route.versionId,
  included:Object.freeze(included),unresolvedReferences:Object.freeze(unresolvedReferences),
  exceptionMarkers:Object.freeze(exceptionMarkers),sourceHashes:Object.freeze(hashes),
  configSha256,questionSha256:route.questionSha256,retrievalPolicy:'lexical-with-source-dependencies',truncated:expand.truncated||queue.length>=maxSources,
  publicationAllowed:false});
}
