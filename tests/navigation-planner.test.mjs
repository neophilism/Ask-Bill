import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTraversalGraph} from '../packages/character/navigation/graph.mjs';
import {planBoundedRoute,PlannerError,createPlannerFence,createWorkerPlanner} from '../packages/character/navigation/worker/planner.mjs';
const surf=(id,x,y=100)=>({id,versionId:'v1',layoutRevision:3,kind:'ledge',scrollContainerId:'main',rect:{x,y,width:130,height:18}});
const makeGraph=()=>buildTraversalGraph({versionId:'v1',layoutRevision:3,viewport:{x:0,y:0,width:550,height:350},bodyRadius:10,maxStep:75,surfaces:[surf('a',40),surf('b',175),surf('c',310)]});
const opts=(graph=makeGraph())=>({graph,versionId:'v1',layoutRevision:3,conversationEpoch:8,startNodeId:'a:0',goalNodeId:'c:2'});
const err=code=>e=>e instanceof PlannerError&&e.code===code;
test('deterministic bounded route uses only source graph nodes',()=>{
 const a=planBoundedRoute(opts());const b=planBoundedRoute(opts());
 assert.deepEqual(a,b);assert.equal(a.kind,'route');assert.equal(a.nodes[0].nodeId,'a:0');assert.equal(a.nodes.at(-1).nodeId,'c:2');
 assert(a.expanded<=240);assert(Object.isFrozen(a));assert(Object.isFrozen(a.nodes));
});
test('stale versions and revisions fail before movement',()=>{
 assert.throws(()=>planBoundedRoute({...opts(),layoutRevision:4}),err('STALE_LAYOUT'));
 assert.throws(()=>planBoundedRoute({...opts(),versionId:'v2'}),err('STALE_LAYOUT'));
});
test('unreachable endpoints safely dock instead of fabricating path',()=>{
 assert.equal(planBoundedRoute({...opts(),goalNodeId:'unknown'}).reason,'TARGET_NOT_WALKABLE');
 const disconnected=buildTraversalGraph({versionId:'v1',layoutRevision:3,viewport:{x:0,y:0,width:550,height:350},surfaces:[surf('a',40),surf('c',310)]});
 assert.equal(planBoundedRoute({...opts(disconnected),goalNodeId:'c:1'}).reason,'NO_SAFE_PATH');
});
test('explicit cancelled signal wins even with a valid graph',()=>{
 assert.equal(planBoundedRoute({...opts(),signal:{aborted:true}}).reason,'CANCELLED');
});
test('zero-time deadline and exhaustion return safe dock promptly',()=>{
 let t=0;const result=planBoundedRoute({...opts(),now:()=>{const current=t;t+=2;return current;},maxMillis:1});
 assert.equal(result.reason,'PLAN_TIMEOUT');
});
test('expansion budget stops before unbounded work',()=>{
 let t=0;const result=planBoundedRoute({...opts(),maxExpansions:1,now:()=>t++*.001});
 assert.equal(result.reason,'EXPANSION_LIMIT');assert.equal(result.expanded,1);
});
test('malformed graph edges, duplicate nodes and hostile endpoint identifiers reject',()=>{
 const g=makeGraph();
 assert.throws(()=>planBoundedRoute({...opts(g),graph:{...g,edges:[...g.edges,{from:'bad',to:'a:0',cost:1}]}}),err('INVALID_GRAPH_EDGE'));
 assert.throws(()=>planBoundedRoute({...opts(g),graph:{...g,nodes:[...g.nodes,g.nodes[0]]}}),err('INVALID_GRAPH_NODE'));
 assert.throws(()=>planBoundedRoute({...opts(g),startNodeId:'<script>'}),err('INVALID_ENDPOINT'));
});
test('bounded budget/clock values reject rather than running indefinitely',()=>{
 assert.throws(()=>planBoundedRoute({...opts(),maxExpansions:10000}),err('INVALID_BUDGET'));
 assert.throws(()=>planBoundedRoute({...opts(),now:()=>Infinity}),err('INVALID_CLOCK'));
});
test('epoch fence rejects late worker results after cancel and document reflow',()=>{
 const fence=createPlannerFence({versionId:'v1',layoutRevision:3,conversationEpoch:8});
 const result=planBoundedRoute(opts());assert.equal(fence.accept(result),result);
 fence.advance({versionId:'v1',layoutRevision:4,conversationEpoch:8});assert.equal(fence.accept(result),null);
 fence.advance({versionId:'v1',layoutRevision:4,conversationEpoch:9});assert.equal(fence.accept(result),null);
 assert.throws(()=>fence.advance({versionId:'v1',layoutRevision:2,conversationEpoch:9}),err('REVISION_REGRESSION'));
 assert.throws(()=>fence.advance({versionId:'v1',layoutRevision:4,conversationEpoch:2}),err('EPOCH_REGRESSION'));
 assert.throws(()=>fence.advance({versionId:'v2',layoutRevision:0,conversationEpoch:3}),err('EPOCH_REGRESSION'));
});
test('worker cancellation clears scheduled stale request with no postMessage',()=>{
 const scheduled=[],messages=[];
 const worker=createWorkerPlanner({schedule:f=>scheduled.push(f),postMessage:m=>messages.push(m)});
 worker.receive({type:'plan',requestId:'req1',payload:opts()});assert.equal(worker.pending,1);
 worker.receive({type:'cancel',requestId:'req1'});scheduled.forEach(f=>f());
 assert.equal(worker.pending,0);assert.equal(messages.length,0);
});
test('worker emits only bounded result; unknown types fail closed',()=>{
 const scheduled=[],messages=[];
 const worker=createWorkerPlanner({schedule:f=>scheduled.push(f),postMessage:m=>messages.push(m)});
 worker.receive({type:'plan',requestId:'req2',payload:opts()});scheduled.forEach(f=>f());
 assert.equal(messages.length,1);assert.equal(messages[0].result.kind,'route');
 assert(!JSON.stringify(messages[0]).includes('rawQuestion'));
 assert.throws(()=>worker.receive({type:'execute',requestId:'req3',javascript:'alert(1)'}),err('INVALID_WORKER_MESSAGE'));
});
test('worker queue caps concurrent requests and cancelAll clears old turns',()=>{
 const jobs=[];const w=createWorkerPlanner({schedule:f=>jobs.push(f),postMessage:()=>{}});
 for(let i=0;i<8;i++)w.receive({type:'plan',requestId:'r'+i,payload:opts()});
 assert.throws(()=>w.receive({type:'plan',requestId:'ninth',payload:opts()}),err('WORKER_QUEUE_LIMIT'));
 w.cancelAll();jobs.forEach(f=>f());assert.equal(w.pending,0);
});
test('version labels may contain exact hierarchical source identifiers',()=>{
 const graph=makeGraph();const g={...graph,versionId:'us:2024/bill-17.v2'};
 assert.equal(planBoundedRoute({...opts(g),versionId:'us:2024/bill-17.v2'}).kind,'route');
});
