import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTraversalGraph,NavigationGraphError} from '../packages/character/navigation/graph.mjs';
const base={versionId:'v1',layoutRevision:5,viewport:{x:0,y:0,width:560,height:400},bodyRadius:10,maxStep:70};
const surface=(id,x,y,w=130,h=18,scrollContainerId='main')=>({id,versionId:'v1',layoutRevision:5,kind:'ledge',scrollContainerId,rect:{x,y,width:w,height:h}});
const obstacle=(kind,x,y,width,height)=>({kind,versionId:'v1',layoutRevision:5,rect:{x,y,width,height}});
const make=(other={})=>buildTraversalGraph({...base,surfaces:[surface('one',60,100),surface('two',195,100)],...other});
const fail=code=>e=>e instanceof NavigationGraphError&&e.code===code;
test('adjacent measured ledges connect with frozen deterministic nodes',()=>{
 const g=make();assert.equal(g.nodes.length,6);assert(g.edges.length>0);
 assert.equal(g.reachable('one:2','two:0').kind,'route-possible');
 assert(Object.isFrozen(g));assert(Object.isFrozen(g.nodes));assert(Object.isFrozen(g.adjacency['one:1']));
});
test('selection safety envelope blocks traversal but text controls remain accessible',()=>{
 const g=make({obstacles:[obstacle('selection',175,90,40,50)]});
 assert.equal(g.reachable('one:0','two:2').kind,'dock');
 assert.equal(g.reachable('one:0','two:2').reason,'NO_SAFE_PATH');
 assert(!g.nodes.some(n=>n.x>165&&n.x<225&&n.y>=80&&n.y<=150));
});
test('untrusted CSS selectors or model-authored clip names are rejected',()=>{
 const s=surface('one',60,100);s.selector='#secret';
 assert.throws(()=>make({surfaces:[s]}),fail('UNTRUSTED_GEOMETRY_FIELD'));
 const o=obstacle('input',100,100,10,10);o.script='alert(1)';
 assert.throws(()=>make({obstacles:[o]}),fail('UNTRUSTED_GEOMETRY_FIELD'));
});
test('version and revision mismatches cannot navigate old sections',()=>{
 assert.throws(()=>make({surfaces:[{...surface('one',50,100),versionId:'v2'}]}),fail('INVALID_SURFACE'));
 assert.throws(()=>make({obstacles:[{...obstacle('text',20,20,30,30),layoutRevision:4}]}),fail('INVALID_OBSTACLE'));
});
test('different scroll containers cannot connect across nested scrollers',()=>{
 const g=make({surfaces:[surface('one',60,100),surface('two',195,100,130,18,'modal')]});
 assert.equal(g.reachable('one:2','two:0').reason,'NO_SAFE_PATH');
});
test('full-screen keyboard and sticky header can eliminate walkable targets',()=>{
 const g=make({obstacles:[obstacle('keyboard',0,0,560,390)]});
 assert.equal(g.nodes.length,0);assert.equal(g.reachable('one:0','two:0').reason,'TARGET_NOT_WALKABLE');
});
test('no edge may intersect inflated control or selected-text obstacle',()=>{
 const g=make({obstacles:[obstacle('input',185,103,35,35)]});
 const r={x:175,y:93,width:55,height:55};
 for(const n of g.nodes)assert(!(n.x>=r.x&&n.x<=r.x+r.width&&n.y>=r.y&&n.y<=r.y+r.height));
});
test('bounded surfaces, obstacles, viewport and radius fail closed',()=>{
 assert.throws(()=>make({surfaces:Array.from({length:81},(_,i)=>surface('s'+i,1,5))}),fail('SURFACE_LIMIT'));
 assert.throws(()=>make({obstacles:Array.from({length:161},()=>obstacle('text',1,1,5,5))}),fail('OBSTACLE_LIMIT'));
 assert.throws(()=>make({bodyRadius:61}),fail('PLANNER_LIMIT'));
 assert.throws(()=>make({viewport:{x:0,y:0,width:1,height:1}}),fail('NO_SAFE_VIEWPORT'));
});
test('duplicate IDs and invalid obstacle categories fail closed',()=>{
 assert.throws(()=>make({surfaces:[surface('same',60,100),surface('same',200,100)]}),fail('INVALID_SURFACE'));
 assert.throws(()=>make({obstacles:[obstacle('script',50,50,20,20)]}),fail('INVALID_OBSTACLE'));
});
test('same geometry order gives same deterministic paths',()=>{
 assert.deepEqual(make().nodes,make().nodes);assert.deepEqual(make().edges,make().edges);
});
