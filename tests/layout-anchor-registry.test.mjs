import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutAnchorRegistry,LayoutAnchorError} from '../packages/character/layout/registry.mjs';

const fail = code => e => e instanceof LayoutAnchorError && e.code === code;
function emitter() {
  const listeners = new Map();
  return {
    addEventListener(name, fn){const set=listeners.get(name)??new Set();set.add(fn);listeners.set(name,set);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
    fire(name){for(const fn of listeners.get(name)??[]) fn();},
    count(name){return listeners.get(name)?.size??0;}
  };
}
function setup({elements=['sec-1','sec-2'],maxAnchors=500,onInvalidate}={}){
 const win={...emitter(),scrollX:40,scrollY:100,visualViewport:emitter()};
 const fonts=emitter();const doc={fonts,defaultView:win};
 const sections=elements.map((id,index)=>({id:'provision-'+id,attached:true,rect:{x:10+index*50,y:20+index*200,width:300,height:80},
     getBoundingClientRect(){return this.rect;}}));
 const root={...emitter(),ownerDocument:doc,contains:e=>sections.includes(e)&&e.attached,
     querySelectorAll:selector=>{assert.equal(selector,'section[id^="provision-"]');return sections.filter(e=>e.attached);}};
 const reg=createLayoutAnchorRegistry({root,versionId:'bill-version-1',windowRef:win,documentRef:doc,maxAnchors,onInvalidate});
 return {reg,root,win,doc,fonts,sections};
}

test('registry collects exact semantic IDs and measures page and viewport CSS pixels',()=>{
 const {reg}=setup();
 assert.deepEqual(reg.collect(),['sec-1','sec-2']);
 const snapshot=reg.measure();
 assert.equal(snapshot.versionId,'bill-version-1');
 assert.equal(snapshot.anchors.length,2);
 assert.deepEqual(snapshot.anchors[0].pageRect,{x:50,y:120,width:300,height:80});
 assert.deepEqual(snapshot.anchors[0].viewportRect,{x:10,y:20,width:300,height:80});
 assert(Object.isFrozen(snapshot));assert(Object.isFrozen(snapshot.anchors[0]));
 assert.equal(reg.resolve({sourceVersionId:'bill-version-1',provisionId:'sec-2'}).pageRect.y,320);
 reg.dispose();
});
test('source version, nonexistent provision, and stale layout revisions fail closed',()=>{
 const {reg,win}=setup();reg.collect();const revision=reg.layoutRevision;
 assert.throws(()=>reg.resolve({sourceVersionId:'bill-version-2',provisionId:'sec-1'}),fail('VERSION_MISMATCH'));
 assert.throws(()=>reg.resolve({sourceVersionId:'bill-version-1',provisionId:'unknown'}),fail('ANCHOR_NOT_FOUND'));
 win.fire('scroll');
 assert.equal(reg.layoutRevision,revision+1);
 assert.throws(()=>reg.measure({expectedRevision:revision}),fail('STALE_LAYOUT_REVISION'));
 assert.throws(()=>reg.resolve({sourceVersionId:'bill-version-1',provisionId:'sec-1',expectedRevision:revision}),fail('STALE_LAYOUT_REVISION'));
 reg.dispose();
});
test('window, visual viewport, fonts and layout changes invalidate a previously issued snapshot',()=>{
 const reasons=[];const {reg,win,fonts}=setup({onInvalidate:evt=>reasons.push(evt.reason)});
 reg.collect();const n=reg.layoutRevision;
 win.fire('resize');win.visualViewport.fire('scroll');win.visualViewport.fire('resize');fonts.fire('loadingdone');
 assert.equal(reg.layoutRevision,n+4);
 assert.deepEqual(reasons.slice(-4),['window-resize','viewport-scroll','viewport-resize','fonts']);
 reg.dispose();
});
test('disconnected or reparented source targets are not reused',()=>{
 const {reg,sections}=setup();reg.collect();const n=reg.layoutRevision;
 sections[0].attached=false;
 assert.throws(()=>reg.resolve({sourceVersionId:'bill-version-1',provisionId:'sec-1'}),fail('DETACHED_ANCHOR'));
 assert.deepEqual(reg.collect(),['sec-2']);
 assert(reg.layoutRevision>n);
 assert.throws(()=>reg.resolve({sourceVersionId:'bill-version-1',provisionId:'sec-1'}),fail('ANCHOR_NOT_FOUND'));
 reg.dispose();
});
test('rejects invalid IDs and foreign/untrusted DOM elements',()=>{
 const {reg,sections}=setup();
 assert.throws(()=>reg.register('../bad',sections[0]),fail('PROVISION_INVALID'));
 assert.throws(()=>reg.register('sec-1',{id:'provision-sec-1',getBoundingClientRect(){return {x:0,y:0,width:1,height:1}}}),fail('UNTRUSTED_ANCHOR'));
 assert.throws(()=>reg.register('sec-1',sections[1]),fail('UNTRUSTED_ANCHOR'));
 reg.dispose();
});
test('bounds malicious dimensions and nonfinite scroll measurements',()=>{
 const {reg,sections,win}=setup();reg.collect();
 sections[0].rect={x:Infinity,y:0,width:20,height:30};
 assert.throws(()=>reg.measure(),fail('INVALID_GEOMETRY'));
 sections[0].rect={x:0,y:0,width:-1,height:30};
 assert.throws(()=>reg.measure(),fail('INVALID_GEOMETRY'));
 sections[0].rect={x:0,y:0,width:10,height:30};win.scrollY=NaN;
 assert.throws(()=>reg.measure(),fail('INVALID_SCROLL'));
 reg.dispose();
});
test('hidden sections stay registered but cannot be walked or pointed to',()=>{
 const {reg,sections}=setup();sections[0].rect={x:0,y:0,width:0,height:0};reg.collect();
 assert.equal(reg.resolve({sourceVersionId:'bill-version-1',provisionId:'sec-1'}).visible,false);
 reg.dispose();
});
test('duplicate IDs, excessive DOM nodes and hostile IDs fail instead of choosing arbitrarily',()=>{
 const a=setup({maxAnchors:1});assert.throws(()=>a.reg.collect(),fail('ANCHOR_LIMIT'));a.reg.dispose();
 const b=setup();b.sections[1].id=b.sections[0].id;
 assert.throws(()=>b.reg.collect(),fail('PROVISION_INVALID'));b.reg.dispose();
 const c=setup();c.sections[1].id='provision-evil<script>';
 assert.throws(()=>c.reg.collect(),fail('PROVISION_INVALID'));c.reg.dispose();
});
test('observer callbacks invalidate and dispose removes all listeners without side effects',()=>{
 const {reg,win,root,fonts}=setup();reg.collect();
 assert.equal(win.count('scroll'),1);assert.equal(root.count('resize'),0);
 const before=reg.layoutRevision;reg.dispose();reg.dispose();
 assert.equal(win.count('scroll'),0);assert.equal(fonts.count('loadingdone'),0);
 win.fire('scroll');assert.equal(reg.layoutRevision,before);
 assert.throws(()=>reg.measure(),fail('REGISTRY_DISPOSED'));
});
test('idempotent re-registration keeps snapshot stable',()=>{
 const {reg,sections}=setup();reg.collect();const n=reg.layoutRevision;
 assert.equal(reg.register('sec-1',sections[0]),n);
 assert.equal(reg.layoutRevision,n);
 reg.dispose();
});
