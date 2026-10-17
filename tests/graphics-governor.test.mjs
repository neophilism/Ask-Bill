import test from 'node:test';import assert from 'node:assert/strict';
import {createGraphicsGovernor,selectCharacterLod,GraphicsPolicyError} from '../packages/character/quality/governor.mjs';
let time=100000;const clock=()=>time;
const make=(config={})=>createGraphicsGovernor({device:'desktop',initialTier:'medium',now:clock,...config});
const entry=(name,triangles)=>({name,triangles,materialCount:2,uri:`/assets/bill/${name}.glb`,hash:'a'.repeat(64)});
test('render policy is conservative; core source reading does not depend on graphics',()=>{
 const g=make();const s=g.snapshot();assert.equal(s.tier,'medium');assert.equal(s.sourceReadingAvailable,true);assert.equal(s.autoplayAllowed,false);assert(Object.isFrozen(s));
 assert.equal(make({device:'mobile',initialTier:'high'}).snapshot().tier,'medium');
 assert.equal(make({initialTier:'poster'}).snapshot().rendererAllowed,false);
});
test('isolated slow frame noise never downshifts hardware',()=>{
 const g=make();for(let i=0;i<35;i++)g.frame({durationMs:i%8===0?100:12,at:100000+i*50});assert.equal(g.snapshot().tier,'medium');
});
test('sustained slow frames cause one deterministic downgrade, without thrashing',()=>{
 const g=make();for(let i=0;i<36;i++)g.frame({durationMs:40,at:100000+i*100});assert.equal(g.snapshot().tier,'low');
 assert.equal(g.snapshot().reason,'SUSTAINED_FRAME_OVERRUN');
 for(let i=0;i<36;i++)g.frame({durationMs:50,at:101000+i*100});assert.equal(g.snapshot().tier,'low');
 for(let i=0;i<36;i++)g.frame({durationMs:50,at:115000+i*100});assert.equal(g.snapshot().tier,'poster');
});
test('memory pressure chooses low tier or poster with private metrics not retained',()=>{
 const g=make({initialTier:'high'});assert.equal(g.memoryPressure({estimatedBytes:120,limitBytes:100}).tier,'low');
 assert.equal(g.memoryPressure({estimatedBytes:180,limitBytes:100}).tier,'poster');
 assert(!('estimatedBytes' in g.snapshot()));
});
test('data saver never upgrades; background hides renderer without discarding content',()=>{
 const g=make({initialTier:'high'});assert.equal(g.setReducedData(true).tier,'low');
 assert.equal(g.setReducedData(false).tier,'low');assert.equal(g.setHidden(true).rendererAllowed,false);
 assert.equal(g.setHidden(false).rendererAllowed,true);
});
test('graphics context loss suspends; only explicit validated reload resumes',()=>{
 const g=make({initialTier:'high'});assert.equal(g.contextLost().rendererAllowed,false);
 assert.equal(g.contextLost().renderSuspended,true);
 assert.equal(g.recoverAfterValidatedReload().tier,'low');
 assert.throws(()=>g.recoverAfterValidatedReload(),GraphicsPolicyError);
});
test('quality never silently increases and dispose cannot be undone',()=>{
 const g=make();assert.equal(g.requestTier('low').tier,'low');assert.throws(()=>g.requestTier('high'),GraphicsPolicyError);
 assert.equal(g.dispose().tier,'poster');assert.equal(g.dispose().rendererAllowed,false);
 assert.throws(()=>g.frame({durationMs:1}),GraphicsPolicyError);
});
test('strict validation rejects malformed device, timings, memory, and preferences',()=>{
 assert.throws(()=>make({device:'headset'}),GraphicsPolicyError);
 const g=make();for(const v of [NaN,Infinity,-1,'25'])assert.throws(()=>g.frame({durationMs:v}),GraphicsPolicyError);
 assert.throws(()=>g.setHidden(1),GraphicsPolicyError);assert.throws(()=>g.setReducedData('false'),GraphicsPolicyError);
 assert.throws(()=>g.memoryPressure({estimatedBytes:-1,limitBytes:100}),GraphicsPolicyError);
});
test('owned low tier GLB only selected within caps and exact path/hash shape',()=>{
 const g=make({initialTier:'low'});const manifest={lods:[entry('high',65000),entry('medium',32000),entry('low',11000)]};
 const asset=selectCharacterLod({manifest,governorState:g.snapshot()});assert.deepEqual(asset,{kind:'glb',tier:'low',uri:'/assets/bill/low.glb',hash:'a'.repeat(64)});
 assert(Object.isFrozen(asset));
 assert.equal(selectCharacterLod({manifest:{lods:[entry('high',70000)]},governorState:g.snapshot()}).kind,'poster');
});
test('rejects external or traversing asset URLs; never bypasses manifest gate',()=>{
 const g=make();for(const uri of ['https://evil.example/model.glb','/assets/bill/../secret.glb','javascript:alert(1)']){
  const asset=selectCharacterLod({manifest:{lods:[{...entry('low',1000),uri}]},governorState:g.snapshot()});
  assert.equal(asset.kind,'poster');
 }
 assert.throws(()=>selectCharacterLod({manifest:{lods:[]} }),GraphicsPolicyError);
});
