import test from 'node:test';
import assert from 'node:assert/strict';
import Controller from '../packages/character/attention/option10-controller.cjs';
const make=()=>Controller.createAttention({width:500,height:280,seed:17});

test('look immediately; follow only after dwell, accelerating with bounded speed',()=>{
  const a=make();a.setPointer({x:300,y:100},0);
  assert.equal(a.tick(100,100).mode,'looking');
  assert.equal(a.tick(100,650).mode,'following');
  const slow=a.state().speed;
  const st=a.tick(100,2200);assert.ok(st.speed>slow&&st.speed<=150);
});
test('verified version-pinned selection has higher priority than the mouse',()=>{
  const a=make();a.setVersion('source:v1');a.setPointer({x:450,y:40},0);
  assert.equal(a.setSelection({validated:true,version:'source:v1',x:100,y:40,start:3,end:15}),true);
  const s=a.tick(100,700);assert.equal(s.hasSelection,true);assert.equal(s.mode,'approach_selection');
  a.setVersion('source:v2');assert.equal(a.state().hasSelection,false);
  assert.equal(a.setSelection({validated:true,version:'source:v1',x:20,y:20,start:0,end:7}),false);
});
test('reject unverified/invalid/malicious selection coordinates and ranges',()=>{
  const a=make();a.setVersion('v');
  for(const v of [{validated:false,version:'v',x:1,y:2,start:0,end:3},
    {validated:true,version:'v',x:NaN,y:10,start:0,end:2},
    {validated:true,version:'v',x:10,y:10,start:30,end:2},
    {validated:true,version:'v',x:10,y:10,start:0,end:99999},
    {validated:true,version:'other',x:10,y:10,start:0,end:5}])assert.equal(a.setSelection(v),false);
  assert.equal(a.state().hasSelection,false);
});
test('never crosses protected blocking surfaces; conservatively docks',()=>{
  const a=make();a.setVersion('v');a.setBlocked([{x:50,y:0,width:250,height:280}]);
  assert.equal(a.setSelection({validated:true,version:'v',x:120,y:80,start:0,end:3}),true);
  const s=a.tick(100,100);assert.equal(s.mode,'dock_blocked');assert.ok(s.x<=50);
});
test('reduced-motion, hide and active text focus interrupt walking',()=>{
  const a=make();a.setPointer({x:400,y:110},0);a.tick(200,1500);
  a.setReducedMotion(true);assert.equal(a.tick(100,1600).mode,'static');
  a.setReducedMotion(false);a.setFocus(true);assert.equal(a.tick(100,1700).mode,'paused_for_input');
  a.setFocus(false);a.setHidden(true);assert.equal(a.tick(100,1800).mode,'hidden');
  a.setHidden(false);a.setPaused(true);assert.equal(a.tick(100,1900).mode,'paused');
});
test('bounds and clock validation fail closed',()=>{
  assert.throws(()=>Controller.createAttention({width:-1}),/bounds/);
  const a=make();assert.throws(()=>a.setBlocked([{x:0,y:0,width:-1,height:12}]),/Invalid/);
  assert.throws(()=>a.tick(-2,100),/Invalid/);
  assert.equal(a.setPointer({x:Infinity,y:1},100),false);
});
test('idle wander is seeded, deterministic and always inside stage',()=>{
  const a=make(),b=make();
  for(let t=100;t<20000;t+=100){const x=a.tick(100,t),y=b.tick(100,t);
    assert.equal(x.x,y.x);assert.equal(x.y,y.y);
    assert.ok(x.x>=17&&x.x<=483&&x.y>=17&&x.y<=263);
  }
});
