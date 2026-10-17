import test from 'node:test';import assert from 'node:assert/strict';
import {createCharacterMotionPreferences,bindCharacterMotionControls,MotionPreferenceError} from '../packages/character/preferences/motion.mjs';
const bad=code=>e=>e instanceof MotionPreferenceError&&e.code===code;
function director(){const calls=[];return{calls,setPreferences:next=>calls.push({type:'preference',...next}),activity:kind=>calls.push({type:'activity',kind})};}
function emitter(){const listeners=new Map();return{listeners,textContent:'',attributes:{},hidden:false,
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
  setAttribute(name,value){this.attributes[name]=value},
  fire(type,detail={}){for(const fn of listeners.get(type)||[])fn(detail);}
};}
test('reduced-motion system setting is honored and user controls cannot bypass it',()=>{
 const d=director(),p=createCharacterMotionPreferences({director:d,systemReducedMotion:true});
 assert.equal(p.getSnapshot().reducedMotion,true);
 p.reducedMotion(false);assert.equal(d.calls.at(-1).reducedMotion,true);
 p.systemMotion(false);assert.equal(p.getSnapshot().reducedMotion,false);
 p.reducedMotion(true);assert.equal(p.getSnapshot().reducedMotion,true);
});
test('user hide, pause and tab visibility are separate; no invisible automatic motion',()=>{
 const d=director(),p=createCharacterMotionPreferences({director:d});
 p.pause(true);assert.equal(p.getSnapshot().paused,true);
 p.visibility(true);assert.equal(p.getSnapshot().hidden,true);
 p.visibility(false);assert.equal(p.getSnapshot().hidden,false);assert.equal(p.getSnapshot().paused,true);
 p.hide(true);assert.equal(p.getSnapshot().userHidden,true);p.hide(false);assert.equal(p.getSnapshot().hidden,false);
});
test('buttons expose pressed state and never steal focus from the reader',()=>{
 const d=director(),p=createCharacterMotionPreferences({director:d});
 const doc=emitter(),pause=emitter(),hide=emitter(),reduce=emitter();
 const bound=bindCharacterMotionControls({preferences:p,document:doc,pauseButton:pause,hideButton:hide,reduceButton:reduce});
 assert.equal(pause.textContent,'Pause Bill');pause.fire('click');assert.equal(pause.attributes['aria-pressed'],'true');
 assert.equal(pause.textContent,'Resume Bill');hide.fire('click');assert.equal(hide.textContent,'Show Bill');
 reduce.fire('click');assert.equal(reduce.attributes['aria-pressed'],'true');
 assert.equal(p.getSnapshot().reducedMotion,true);
 bound.dispose();assert.equal(pause.listeners.get('click').size,0);
});
test('pointer, selection, keyboard and focus activity immediately cancels motion through the director',()=>{
 const d=director(),p=createCharacterMotionPreferences({director:d}),doc=emitter();
 bindCharacterMotionControls({preferences:p,document:doc,pauseButton:emitter(),hideButton:emitter(),reduceButton:emitter()});
 for(const [event,kind] of [['pointerdown','pointer'],['keydown','keyboard'],['focusin','focus'],
   ['selectionchange','selection'],['wheel','scroll'],['touchstart','touch']]){
  doc.fire(event);assert.deepEqual(d.calls.at(-1),{type:'activity',kind});
 }
});
test('visibilitychange and OS preference changes immediately update effective controls',()=>{
 const d=director(),p=createCharacterMotionPreferences({director:d}),doc=emitter(),media=emitter();
 media.matches=false;
 const bound=bindCharacterMotionControls({preferences:p,document:doc,pauseButton:emitter(),hideButton:emitter(),reduceButton:emitter(),mediaQuery:media});
 doc.hidden=true;doc.fire('visibilitychange');assert.equal(p.getSnapshot().hidden,true);
 media.matches=true;media.fire('change',{matches:true});assert.equal(p.getSnapshot().reducedMotion,true);
 doc.hidden=false;doc.fire('visibilitychange');assert.equal(p.getSnapshot().hidden,false);
 bound.dispose();assert.equal(media.listeners.get('change').size,0);
});
test('invalid controls and input types fail closed without hiding statutory text',()=>{
 const p=createCharacterMotionPreferences({director:director()});
 for(const value of ['true',1,null])assert.throws(()=>p.pause(value),bad('INVALID_PREFERENCE'));
 assert.throws(()=>p.activity('microphone'),bad('INVALID_ACTIVITY'));
 assert.throws(()=>bindCharacterMotionControls({preferences:p,document:null}),bad('INVALID_BROWSER_CONTROLS'));
 p.dispose();assert.throws(()=>p.hide(true),bad('PREFERENCE_ADAPTER_DISPOSED'));
});
