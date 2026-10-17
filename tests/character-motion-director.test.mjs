import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createIdleDirector} from '../packages/character/animation/idle-director.mjs';

const lib=JSON.parse(await readFile(new URL('../assets/bill/characters/animation-library.json',import.meta.url)));
const make=(seed=1,policy={})=>createIdleDirector({
  library:{...lib,policy:{...lib.policy,...policy}},seed,startedAt:0
});

test('Bill waits 45–75 seconds, performs one bounded idle action, and cools down',()=>{
  const d=make(29,{danceChance:1});
  assert.equal(d.tick(44999).clip,null);
  const a=d.tick(75001);
  assert.match(a.clip,/^Dance/);
  assert.equal(a.reason,'dancing');
  assert.ok(a.remainingMs>0 && a.remainingMs<=5400);
  assert.equal(d.tick(76000).clip,a.clip);
  const end=d.tick(95000);
  assert.equal(end.clip,null);
  assert.equal(end.reason,'finished');
  assert.equal(d.tick(95000+104000).clip,null);
  assert.match(d.tick(95000+196000).clip,/^Dance/);
});
test('quiet gestures are real clips, distinct from dances',()=>{
  const d=make(42,{danceChance:0});
  const s=d.tick(76000);
  assert.match(s.clip,/^Idle(?!$)/);
  assert.equal(s.reason,'idle-gesture');
  assert.ok(lib.clips.some(x=>x.name===s.clip&&x.autoIdle));
});
test('no back-to-back repeats and seeded replay is deterministic',()=>{
  const a=make(5,{danceChance:1,performanceCooldownMinSeconds:31,performanceCooldownMaxSeconds:31});
  const b=make(5,{danceChance:1,performanceCooldownMinSeconds:31,performanceCooldownMaxSeconds:31});
  const clips=[];
  for(let now=80000;now<=480000;now+=1000){
    const left=a.tick(now),right=b.tick(now);
    assert.equal(left.clip,right.clip);
    assert.equal(left.reason,right.reason);
    if(left.reason==='dancing')clips.push(left.clip);
  }
  assert.ok(clips.length>=2);
  for(let i=1;i<clips.length;i++)assert.notEqual(clips[i],clips[i-1]);
});
test('pointer, keyboard, question/selection, voice, hidden tab and pause suppress idle dance immediately',()=>{
  for(const forbidden of [
    {hasSelection:true},{focused:true},{questionActive:true},{speechActive:true},
    {paused:true},{visible:false},{reducedMotion:true},{enabled:false},{pointerActive:true},{manualAnimation:true}
  ]){
    const d=make(7,{danceChance:1});
    assert.match(d.tick(76000).clip,/^Dance/);
    assert.equal(d.tick(76001,forbidden).clip,null);
    assert.equal(d.tick(76002,forbidden).reason,'suppressed');
    assert.equal(d.tick(76003).reason,'resumed');
    assert.equal(d.tick(76004).clip,null);
  }
});
test('fresh input resets its idle threshold instead of interrupting and immediately restarting',()=>{
  const d=make(22,{danceChance:1});
  d.activity(40000);
  assert.equal(d.tick(75000).clip,null);
  const s=d.tick(120000);
  assert.match(s.clip,/^Dance/);
  d.activity(120001);
  assert.equal(d.tick(125000).clip,null);
  assert.equal(d.tick(162000).clip,null);
});
test('manual dance audition honors reduced motion, pause and never invokes an audio provider',()=>{
  const d=make(63);
  assert.equal(d.auditionDance(2500,{reducedMotion:true}).clip,null);
  assert.equal(d.auditionDance(2600,{paused:true}).clip,null);
  const s=d.auditionDance(4000);
  assert.match(s.clip,/^Dance/);
  assert.equal(d.tick(4001).clip,s.clip);
  assert.equal(d.activity(4002).clip,null);
});
test('reject invalid times, unsafe library metadata and missing dance actions',()=>{
  assert.throws(()=>createIdleDirector({library:{clips:[]}}),/library/);
  assert.throws(()=>createIdleDirector({library:lib,seed:1.2}),/clock/);
  assert.throws(()=>createIdleDirector({library:{...lib,clips:lib.clips.slice(0,12)}}),/dance/);
  const d=make(1);
  assert.throws(()=>d.tick(-1),/clock/);
  d.tick(500);
  assert.throws(()=>d.activity(499),/time/);
  assert.throws(()=>d.auditionDance(Number.NaN),/time/);
});
