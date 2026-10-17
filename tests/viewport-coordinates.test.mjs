import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewportGeometry,ViewportGeometryError} from '../packages/character/coordinates/viewport.mjs';
const err=code=>e=>e instanceof ViewportGeometryError&&e.code===code;
const make=(extra={})=>createViewportGeometry({versionId:'bill-v1',layoutRevision:7,scroll:{x:45,y:900},layoutViewport:{width:1280,height:800},canvasRect:{x:30,y:50,width:800,height:500},canvasBitmap:{width:1600,height:1000},...extra});
const anchor=(extra={})=>({versionId:'bill-v1',provisionId:'section-1',layoutRevision:7,visible:true,viewportRect:{x:100,y:120,width:400,height:180},pageRect:{x:145,y:1020,width:400,height:180},...extra});
test('CSS page coordinates map to bitmap exactly once across scroll and DPR',()=>{
  const v=make();
  assert.deepEqual(v.pageToCanvas({x:145,y:1020}),{x:140,y:140});
  assert.deepEqual(v.canvasToPage({x:140,y:140}),{x:145,y:1020});
  assert.deepEqual(v.pageToClient({x:145,y:1020}),{x:100,y:120});
});
test('visual viewport offsets and pinch zoom do not double scale already-layout CSS pixels',()=>{
  const v=make({visualViewport:{offsetLeft:150,offsetTop:80,width:600,height:350,scale:2}});
  assert.deepEqual(v.visualToCanvas({x:0,y:40}),v.pageToCanvas({x:195,y:1020}));
  assert.equal(v.visualViewport.scale,2);
  assert.deepEqual(v.pageToCanvas({x:145,y:1020}),{x:140,y:140});
});
test('320px mobile stage with keyboard and safe-area insets stays bounded',()=>{
  const v=make({scroll:{x:0,y:1100},layoutViewport:{width:320,height:750},visualViewport:{offsetLeft:0,offsetTop:0,width:320,height:390,scale:1},canvasRect:{x:0,y:0,width:320,height:390},canvasBitmap:{width:960,height:1170},safeInsets:{top:24,right:10,bottom:34,left:10}});
  const a=anchor({viewportRect:{x:10,y:130,width:280,height:100},pageRect:{x:10,y:1230,width:280,height:100}});
  assert.deepEqual(v.anchorToCanvas(a).contact,{x:450,y:690});
  assert.equal(v.safeViewport.height,332);
});
test('source version or revision mismatch fails closed before navigation',()=>{
  const v=make();
  assert.throws(()=>v.anchorToCanvas(anchor({versionId:'v2'})),err('VERSION_MISMATCH'));
  assert.throws(()=>v.anchorToCanvas(anchor({layoutRevision:8})),err('STALE_LAYOUT_REVISION'));
  assert.throws(()=>v.anchorToCanvas(anchor(),{expectedRevision:9}),err('STALE_LAYOUT_REVISION'));
});
test('visually hidden, obscured, and offscreen anchors dock instead of inventing coordinates',()=>{
  const v=make();
  assert.equal(v.anchorToCanvas(anchor({visible:false})).kind,'dock');
  const distant=anchor({viewportRect:{x:100,y:2000,width:200,height:100},pageRect:{x:145,y:2900,width:200,height:100}});
  assert.deepEqual(v.anchorToCanvas(distant).reason,'ANCHOR_OFFSCREEN');
});
test('anchor CSS viewport/page inconsistency rejects stale scroll values',()=>{
  assert.throws(()=>make().anchorToCanvas(anchor({pageRect:{x:145,y:990,width:400,height:180}})),err('ANCHOR_POSITION_MISMATCH'));
});
test('invalid nonfinite points, negative geometry and excessive bitmap resources fail',()=>{
  assert.throws(()=>make().pageToCanvas({x:Infinity,y:3}),err('INVALID_PAGE_POINT'));
  assert.throws(()=>make({canvasRect:{x:0,y:0,width:0,height:50}}),err('INVALID_CANVAS'));
  assert.throws(()=>make({canvasBitmap:{width:200000,height:1}}),err('INVALID_CANVAS_BITMAP'));
  assert.throws(()=>make({layoutRevision:-1}),err('REVISION_REQUIRED'));
});
test('inconsistent visual offsets and impossible safe areas reject before planning',()=>{
  assert.throws(()=>make({visualViewport:{offsetLeft:1000,offsetTop:0,width:600,height:300,scale:2}}),err('VISUAL_VIEWPORT_OVERFLOW'));
  assert.throws(()=>make({safeInsets:{top:400,bottom:400,left:0,right:0}}),err('INVALID_SAFE_INSETS'));
});
test('contact point returns frozen stage pixels, never source DOM or model coordinates',()=>{
  const v=make();const result=v.anchorToCanvas(anchor());
  assert.equal(result.kind,'target');assert.deepEqual(result.contact,{x:540,y:500});
  assert(Object.isFrozen(result));assert(Object.isFrozen(result.contact));
  assert(!Object.hasOwn(result,'element'));assert(!Object.hasOwn(result,'selector'));
});
