/* Ask Bill Option 10 attention controller — provider-free, viewport-local prototype.
 * No eye/camera/voice access. Never takes selectors, code or coordinates from an LLM.
 * This module is a prototype; route planning, DOM provenance and UX gates remain open.
 */
(function (root) {
  'use strict';
  const limit = (n,a,b) => Math.min(b,Math.max(a,n));
  const finite = n => typeof n==='number' && Number.isFinite(n);
  const intersect = (x,y,z) => x>=z.x && x<=z.x+z.width && y>=z.y && y<=z.y+z.height;
  const safeRect = z => z && [z.x,z.y,z.width,z.height].every(finite) && z.width>=0 && z.height>=0;
  const copy = s => Object.freeze({...s});

  function createAttention({width=400,height=260,seed=7,start={x:40,y:height/2},maxSpeed=150}={}) {
    if (![width,height,maxSpeed].every(finite) || width<40 || height<40 || maxSpeed<=0 || maxSpeed>300) throw Error('Invalid stage bounds');
    if (!start || !finite(start.x)|| !finite(start.y)) throw Error('Invalid initial position');
    const pad=17;
    const place = p => ({x:limit(p.x,pad,width-pad),y:limit(p.y,pad,height-pad)});
    let pos=place(start), pointer=null, selection=null, blocked=[], time=0;
    let lastPointer=0, lastPointerMoved=0, pointerSince=0, lastTravel=0, hidden=false,paused=false,focused=false,reduced=false;
    let revision=null,nonce=seed>>>0,mode='idle',gaze=null,speed=0;
    const inside = p => blocked.some(z=>intersect(p.x,p.y,z));
    const allowed = p => !inside(p);
    const reset=()=>{selection=null;mode='idle';speed=0};
    const state=()=>copy({x:pos.x,y:pos.y,speed,mode,gaze,hasSelection:!!selection,hidden,paused,reducedMotion:reduced});

    function setBounds(next){
      if(!next || !finite(next.width)||!finite(next.height)||next.width<40||next.height<40)throw Error('Invalid resize');
      width=next.width;height=next.height;pos=place(pos);blocked=[];reset();pointer=null;
    }
    function setBlocked(rects){
      if(!Array.isArray(rects)||rects.length>80||!rects.every(safeRect))throw Error('Invalid protected regions');
      blocked=rects.map(r=>({x:r.x,y:r.y,width:r.width,height:r.height}));
      if(inside(pos)) {pos=place({x:pad,y:height-pad});if(inside(pos))reset();}
    }
    function setPointer(p,at){
      if(!p || !finite(p.x)||!finite(p.y)||!finite(at)||at<time)return false;
      const next=place(p);const moved=pointer ? Math.hypot(next.x-pointer.x,next.y-pointer.y)>7:true;
      if(moved) {lastPointerMoved=at;pointerSince=at;}
      pointer=next;lastPointer=at;gaze=next;
      return true;
    }
    // Selection must be a verified source anchor from the DOM adapter, not a model claim.
    function setSelection(anchor){
      if(!anchor || anchor.validated!==true || typeof anchor.version!=='string'||!anchor.version || anchor.version.length>128 ||
         !finite(anchor.x)||!finite(anchor.y)||!Number.isInteger(anchor.start)||!Number.isInteger(anchor.end)||
         anchor.start<0||anchor.end<=anchor.start||anchor.end-anchor.start>20000||
         (revision!==null&&anchor.version!==revision))return false;
      selection={...place(anchor),version:anchor.version,start:anchor.start,end:anchor.end};
      mode='approach_selection';gaze=place(anchor);return true;
    }
    function setVersion(v){
      if(typeof v!=='string'||!v||v.length>128)throw Error('Invalid version');
      if(v!==revision) {revision=v;reset();}
    }
    function setFocus(isTyping){focused=Boolean(isTyping);if(focused)mode='paused_for_input';}
    function setHidden(v){hidden=Boolean(v);if(hidden)reset();}
    function setPaused(v){paused=Boolean(v);if(paused)mode='paused';}
    function setReducedMotion(v){reduced=Boolean(v);if(reduced) {speed=0;mode='static';}}
    function clearSelection(){reset();}
    function cancel(){pointer=null;gaze=null;reset();}
    function random(){nonce=(Math.imul(nonce,1664525)+1013904223)>>>0;return nonce/4294967296;}
    function moveToward(dest,dt,cap){
      const dx=dest.x-pos.x,dy=dest.y-pos.y,d=Math.hypot(dx,dy);
      if(d<.8){speed=0;return true;}
      const step=Math.min(d,cap*dt/1000);
      const proposed=place({x:pos.x+dx/d*step,y:pos.y+dy/d*step});
      if(!allowed(proposed)){speed=0;mode='dock_blocked';return false;}
      pos=proposed;speed=cap;lastTravel=time;return d-step<.8;
    }
    function tick(dt,at){
      if(!finite(dt)||!finite(at)||dt<0||dt>1000||at<time)throw Error('Invalid clock');
      time=at;
      if(hidden||paused||reduced||focused){speed=0;mode=hidden?'hidden':paused?'paused':reduced?'static':'paused_for_input';return state();}
      if(selection){
        // Approach the margin adjacent to selection, never on its text anchor.
        const side=selection.x<width/2?1:-1;
        const target=place({x:selection.x+side*72,y:selection.y+30});
        if(!allowed(target)){speed=0;mode='dock_blocked';return state();}
        const arrived=moveToward(target,dt,Math.min(maxSpeed,145));
        if(mode!=='dock_blocked')mode=arrived?'pointing':'approach_selection';
        return state();
      }
      if(pointer && at-lastPointer<10000){
        const dwell=at-lastPointerMoved;
        if(dwell<550){speed=0;mode='looking';return state();}
        if(dwell<3600){
          const dest=place({x:pointer.x-37,y:pointer.y+35});
          const cap=Math.min(maxSpeed,38+Math.min(dwell-550,2500)/2500*100);
          const arrived=allowed(dest)&&moveToward(dest,dt,cap);
          if(mode!=='dock_blocked')mode=arrived?'attentive':'following';
          return state();
        }
      }
      // The wander target changes slowly and is seeded/replayable, not random every frame.
      if(!tick.target || at-tick.targetAt>3600){
        tick.target=place({x:pad+random()*(width-2*pad),y:pad+random()*(height-2*pad)});
        tick.targetAt=at;
      }
      if(allowed(tick.target)){
        const arrived=moveToward(tick.target,dt,Math.min(maxSpeed,32));
        if(mode!=='dock_blocked')mode=arrived?'idle':'wandering';
      } else {speed=0;mode='idle';}
      return state();
    }
    return Object.freeze({state,tick,setPointer,setSelection,setVersion,setBounds,setBlocked,
      setFocus,setHidden,setPaused,setReducedMotion,clearSelection,cancel});
  }
  const api=Object.freeze({createAttention});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BillAttention=api;
})(typeof window!=='undefined'?window:null);
