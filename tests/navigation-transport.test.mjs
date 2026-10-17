import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTraversalGraph} from '../packages/character/navigation/graph.mjs';
import {buildWorkerTraversalGraph} from '../packages/character/navigation/worker/transport.mjs';
import {planBoundedRoute} from '../packages/character/navigation/worker/planner.mjs';
const input=()=>({versionId:'v1',layoutRevision:7,viewport:{x:0,y:0,width:600,height:320},bodyRadius:8,maxStep:90,
  surfaces:[{id:'first',versionId:'v1',layoutRevision:7,kind:'ledge',scrollContainerId:'root',rect:{x:30,y:90,width:120,height:18}},
  {id:'second',versionId:'v1',layoutRevision:7,kind:'ledge',scrollContainerId:'root',rect:{x:170,y:90,width:120,height:18}}]});
test('graph method cannot clone; verified projection travels through structured-clone Worker',()=>{
 const graph=buildTraversalGraph(input());assert.throws(()=>structuredClone(graph));
 const projected=buildWorkerTraversalGraph(input());
 const copied=structuredClone(projected);
 assert.equal(copied.nodes.length,graph.nodes.length);assert.equal(copied.edges.length,graph.edges.length);
 assert.deepEqual(Object.keys(copied),['versionId','layoutRevision','nodes','edges']);
 assert(!Object.hasOwn(copied,'reachable'));assert(!copied.nodes.some(n=>'scrollContainerId' in n));
});
test('serialized graph remains usable by the bounded, epoch-pinned planner',()=>{
 const wire=structuredClone(buildWorkerTraversalGraph(input()));
 const start=wire.nodes[0].id,goal=wire.nodes.at(-1).id;
 const plan=planBoundedRoute({graph:wire,versionId:'v1',layoutRevision:7,conversationEpoch:2,startNodeId:start,goalNodeId:goal});
 assert.equal(plan.kind,'route');
 assert.equal(plan.nodes.at(-1).nodeId,goal);
});
test('builder rejects untrusted selectors, foreign source versions and hostile obstacle inputs',()=>{
 const extra=input();extra.surfaces[0].selector='#private';
 assert.throws(()=>buildWorkerTraversalGraph(extra));
 const other=input();other.surfaces[0].versionId='v2';
 assert.throws(()=>buildWorkerTraversalGraph(other));
 const obstacle=input();obstacle.obstacles=[{kind:'script',versionId:'v1',layoutRevision:7,rect:{x:50,y:80,width:10,height:10}}];
 assert.throws(()=>buildWorkerTraversalGraph(obstacle));
});
test('projection is frozen and deterministic under independent verified builds',()=>{
 const a=buildWorkerTraversalGraph(input()),b=buildWorkerTraversalGraph(input());
 assert(Object.isFrozen(a));assert(Object.isFrozen(a.nodes));assert(Object.isFrozen(a.nodes[0]));
 assert.deepEqual(a,b);assert.equal(a.versionId,'v1');assert.equal(a.layoutRevision,7);
});
