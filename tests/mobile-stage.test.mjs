import test from 'node:test';
import assert from 'node:assert/strict';
import {planMobileStage,MobileStageError} from '../packages/character/mobile/stage.mjs';
const base=()=>({viewport:{x:0,y:0,width:320,height:760},dockRect:{x:224,y:570,width:78,height:124},versionId:'v1',layoutRevision:4,
    safeArea:{top:0,right:8,bottom:20,left:8},obstacles:[]});
const whitespace={id:'whitespace-1',versionId:'v1',layoutRevision:4,kind:'whitespace',rect:{x:50,y:200,width:180,height:160}};
test('32rem phone dock is inside measured visual viewport without shifting reader or scrolling',()=>{
  const r=planMobileStage(base());
  assert.equal(r.mode,'docked');assert.equal(r.scrollAllowed,false);assert.deepEqual(r.travel,[]);assert(Object.isFrozen(r));
});
test('reduced-motion, pause and user interaction force stationary dock even when follow target exists',()=>{
  const q={...base(),sourceTarget:{versionId:'v1',layoutRevision:4,surfaceId:'whitespace-1'},allowedSurfaces:[whitespace]};
  for(const motion of [{reduced:true,following:true},{paused:true,following:true},{userActive:true,following:true}]){
   const r=planMobileStage({...q,motion});assert.equal(r.mode,'docked');assert.equal(r.reason,'USER_OR_ACCESSIBILITY_PRIORITY');
  }
});
test('hidden control immediately removes stage but preserves semantic source identifier',()=>{
  const r=planMobileStage({...base(),motion:{hidden:true}});assert.equal(r.mode,'hidden');assert.equal(r.reason,'VISITOR_HID_BILL');assert.equal(r.versionId,'v1');
});
test('virtual keyboard clipping stage disables unsafe placements and never scrolls',()=>{
  assert.equal(planMobileStage({...base(),keyboardTop:550}).mode,'hidden');
  const q={...base(),keyboardTop:720};const r=planMobileStage(q);assert.equal(r.mode,'docked');assert.equal(r.canMove,false);
});
test('focused inputs and selected text take precedence over Bill even in valid whitespace',()=>{
  const q={...base(),motion:{following:true},sourceTarget:{versionId:'v1',layoutRevision:4,surfaceId:'whitespace-1'},allowedSurfaces:[whitespace]};
  assert.equal(planMobileStage({...q,focusRect:{x:0,y:400,width:200,height:40}}).mode,'docked');
  assert.equal(planMobileStage({...q,selectionRect:{x:20,y:190,width:40,height:40}}).mode,'docked');
});
test('registered empty safe whitespace is eligible for nearby without authoritative text edits',()=>{
  const q={...base(),motion:{following:true},sourceTarget:{versionId:'v1',layoutRevision:4,surfaceId:'whitespace-1'},allowedSurfaces:[whitespace]};
  const r=planMobileStage(q);assert.equal(r.mode,'nearby');assert.equal(r.reason,'REGISTERED_WHITESPACE');assert.equal(r.canMove,false);assert.equal(r.scrollAllowed,false);
  assert(r.rect.x>=whitespace.rect.x&&r.rect.x+r.rect.width<=whitespace.rect.x+whitespace.rect.width);
});
test('wrong-version, stale layout, or unknown source target can never move Bill',()=>{
  const q={...base(),motion:{following:true},allowedSurfaces:[whitespace]};
  for(const sourceTarget of [{versionId:'v2',layoutRevision:4,surfaceId:'whitespace-1'},{versionId:'v1',layoutRevision:3,surfaceId:'whitespace-1'},{versionId:'v1',layoutRevision:4,surfaceId:'wrong'},{versionId:'v1',layoutRevision:4,surfaceId:'whitespace-1',x:400}]){
   assert.equal(planMobileStage({...q,sourceTarget}).mode,'docked');
  }
});
test('unsafe obstacles, keyboard and cramped dock remain hidden or docked',()=>{
  const b=base();assert.equal(planMobileStage({...b,obstacles:[{x:220,y:565,width:80,height:130}]}).mode,'hidden');
  assert.equal(planMobileStage({...b,dockRect:{x:-100,y:0,width:80,height:130}}).mode,'hidden');
  assert.equal(planMobileStage({...b,viewport:{x:0,y:0,width:240,height:220}}).mode,'hidden');
});
test('untrusted dimensions and oversized geometry fail closed',()=>{
 for(const bad of [Infinity,NaN,-100001,'2'])assert.throws(()=>planMobileStage({...base(),viewport:{x:bad,y:0,width:320,height:760}}),MobileStageError);
 assert.throws(()=>planMobileStage({...base(),obstacles:Array.from({length:251},()=>({x:0,y:0,width:1,height:1}))}),MobileStageError);
 assert.throws(()=>planMobileStage({...base(),keyboardTop:900}),MobileStageError);
 assert.throws(()=>planMobileStage({...base(),safeArea:{top:-10,right:8,bottom:10,left:8}}),MobileStageError);
});
test('malformed untrusted surface rectangles never become motion coordinates',()=>{
  const q={...base(),motion:{following:true},sourceTarget:{versionId:'v1',layoutRevision:4,surfaceId:'whitespace-1'}};
  assert.throws(()=>planMobileStage({...q,allowedSurfaces:[{...whitespace,rect:{x:NaN,y:0,width:200,height:160}}]}),MobileStageError);
});
