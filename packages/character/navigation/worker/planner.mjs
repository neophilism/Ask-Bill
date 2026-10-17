/** AB-068: deterministic bounded path planner over a trusted, measured traversal graph. */
export class PlannerError extends Error {constructor(code){super(code);this.name='PlannerError';this.code=code;}}
const fail=code=>{throw new PlannerError(code)};
const validId=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_:-]{0,119}$/.test(value);
const validVersion=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/.test(value);
const positiveInt=n=>Number.isSafeInteger(n)&&n>=0;
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000000;
const frozen=object=>Object.freeze(object);
function context(value){
 if(!value||typeof value!=='object'||!validVersion(value.versionId)||!positiveInt(value.layoutRevision)||!positiveInt(value.conversationEpoch))fail('INVALID_CONTEXT');
 return frozen({versionId:value.versionId,layoutRevision:value.layoutRevision,conversationEpoch:value.conversationEpoch});
}
function verifiedGraph(graph, ctx){
 if(!graph||graph.versionId!==ctx.versionId||graph.layoutRevision!==ctx.layoutRevision)fail('STALE_LAYOUT');
 if(!Array.isArray(graph.nodes)||graph.nodes.length>240||!Array.isArray(graph.edges)||graph.edges.length>1200)fail('GRAPH_LIMIT');
 const nodes=new Map();for(const n of graph.nodes){
  if(!n||!validId(n.id)||nodes.has(n.id)||!finite(n.x)||!finite(n.y))fail('INVALID_GRAPH_NODE');
  nodes.set(n.id,frozen({id:n.id,x:n.x,y:n.y}));
 }
 const neighbors=new Map([...nodes.keys()].map(k=>[k,[]]));
 for(const e of graph.edges){
  if(!e||!nodes.has(e.from)||!nodes.has(e.to)||e.from===e.to||!finite(e.cost)||e.cost<0||e.cost>200000)fail('INVALID_GRAPH_EDGE');
  // AB-067 creates the only trusted safe edges. A model must never call this API.
  neighbors.get(e.from).push({id:e.to,cost:e.cost});neighbors.get(e.to).push({id:e.from,cost:e.cost});
 }
 for(const list of neighbors.values())list.sort((a,b)=>a.id.localeCompare(b.id));
 return {nodes,neighbors};
}
function dock(reason,ctx,meta={}){return frozen({kind:'dock',reason,...ctx,...meta});}
export function planBoundedRoute({graph,versionId,layoutRevision,conversationEpoch,startNodeId,goalNodeId,maxExpansions=240,maxMillis=16,now=()=>performance.now(),signal}={}){
 const ctx=context({versionId,layoutRevision,conversationEpoch});
 if(!validId(startNodeId)||!validId(goalNodeId))fail('INVALID_ENDPOINT');
 if(!positiveInt(maxExpansions)||maxExpansions<1||maxExpansions>240||!finite(maxMillis)||maxMillis<1||maxMillis>32||typeof now!=='function')fail('INVALID_BUDGET');
 const {nodes,neighbors}=verifiedGraph(graph,ctx);
 if(!nodes.has(startNodeId)||!nodes.has(goalNodeId))return dock('TARGET_NOT_WALKABLE',ctx);
 if(signal?.aborted)return dock('CANCELLED',ctx);
 const started=now();if(!finite(started))fail('INVALID_CLOCK');
 const deadline=started+maxMillis;
 const best=new Map([[startNodeId,0]]),parent=new Map(),open=[startNodeId],closed=new Set();
 let expanded=0;
 while(open.length){
  if(signal?.aborted)return dock('CANCELLED',ctx,{expanded});
  const t=now();if(!finite(t)||t<started)fail('INVALID_CLOCK');
  if(t>=deadline)return dock('PLAN_TIMEOUT',ctx,{expanded});
  if(expanded>=maxExpansions)return dock('EXPANSION_LIMIT',ctx,{expanded});
  open.sort((a,b)=>best.get(a)-best.get(b)||a.localeCompare(b));
  const nodeId=open.shift();if(closed.has(nodeId))continue;
  closed.add(nodeId);expanded++;
  if(nodeId===goalNodeId){
   const path=[];let key=goalNodeId;
   for(let steps=0;steps<=nodes.size;steps++){
    const n=nodes.get(key);path.push(frozen({nodeId:n.id,x:n.x,y:n.y}));
    if(key===startNodeId)break;
    key=parent.get(key);if(!key)fail('INVALID_PARENT_CHAIN');
   }
   if(path.at(-1)?.nodeId!==startNodeId)fail('INVALID_PARENT_CHAIN');
   path.reverse();return frozen({kind:'route',...ctx,nodes:frozen(path),cost:Math.round(best.get(goalNodeId)*1000)/1000,expanded});
  }
  for(const entry of neighbors.get(nodeId)){
   if(closed.has(entry.id))continue;
   const candidate=best.get(nodeId)+entry.cost;
   if(candidate<(best.get(entry.id)??Infinity)){
    best.set(entry.id,candidate);parent.set(entry.id,nodeId);
    if(!open.includes(entry.id))open.push(entry.id);
   }
  }
 }
 return dock('NO_SAFE_PATH',ctx,{expanded});
}
/** The caller must invalidate on version switches, resize, cancellation and new answers. */
export function createPlannerFence(initial){
 let current=context(initial);
 const advance=next=>{
  const newer=context(next);
  if(newer.conversationEpoch<current.conversationEpoch)fail('EPOCH_REGRESSION');
  if(newer.versionId===current.versionId&&newer.conversationEpoch===current.conversationEpoch&&newer.layoutRevision<current.layoutRevision)fail('REVISION_REGRESSION');
  current=newer;return current;
 };
 const accept=result=>{
  if(!result||result.versionId!==current.versionId||result.layoutRevision!==current.layoutRevision||result.conversationEpoch!==current.conversationEpoch)return null;
  return result;
 };
 return frozen({advance,accept,get current(){return current;}});
}
/** Worker transport with cancellable pending requests; never broadcasts source text. */
export function createWorkerPlanner({postMessage,schedule=fn=>setTimeout(fn,0)}={}){
 if(typeof postMessage!=='function'||typeof schedule!=='function')fail('INVALID_WORKER_ADAPTER');
 const pending=new Map();
 function receive(msg){
  if(!msg||!validId(msg.requestId)||!['plan','cancel'].includes(msg.type))fail('INVALID_WORKER_MESSAGE');
  if(msg.type==='cancel'){pending.delete(msg.requestId);return;}
  if(pending.size>=8)fail('WORKER_QUEUE_LIMIT');
  const token=Symbol(msg.requestId);pending.set(msg.requestId,token);
  schedule(()=>{
   if(pending.get(msg.requestId)!==token)return;
   let result;
   try{result=planBoundedRoute(msg.payload);}catch(e){result=frozen({kind:'dock',reason:e instanceof PlannerError?e.code:'PLANNER_FAILED'});}
   if(pending.get(msg.requestId)===token){pending.delete(msg.requestId);postMessage(frozen({type:'result',requestId:msg.requestId,result}));}
  });
 }
 return frozen({receive,cancelAll(){pending.clear();},get pending(){return pending.size;}});
}
