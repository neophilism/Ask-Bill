/** AB-075: session-only Bill motion/pause/hide controls; source reading is independent. */
export class MotionPreferenceError extends Error{constructor(code){super(code);this.code=code;this.name='MotionPreferenceError';}}
const fail=code=>{throw new MotionPreferenceError(code)};
const activityTypes=new Set(['pointer','keyboard','touch','focus','selection','question','speech','scroll']);
export function createCharacterMotionPreferences({director,systemReducedMotion=false,onChange=()=>{}}={}){
  if(!director||typeof director.setPreferences!=='function'||typeof director.activity!=='function'||
     typeof onChange!=='function'||typeof systemReducedMotion!=='boolean')fail('INVALID_DIRECTOR_ADAPTER');
  let hidden=false,paused=false,manualReduced=false,systemReduced=systemReducedMotion,tabHidden=false;
  let detached=false;
  const ensure=()=>{if(detached)fail('PREFERENCE_ADAPTER_DISPOSED')};
  const snapshot=()=>Object.freeze({userHidden:hidden,userPaused:paused,userReducedMotion:manualReduced,
    systemReducedMotion:systemReduced,tabHidden,hidden:hidden||tabHidden,paused,
    reducedMotion:manualReduced||systemReduced});
  const apply=()=>{
    ensure();const next=snapshot();
    director.setPreferences({hidden:next.hidden,paused:next.paused,reducedMotion:next.reducedMotion});
    try{onChange(next);}catch{}return next;
  };
  apply();
  return Object.freeze({
    getSnapshot:snapshot,
    hide(value){ensure();if(typeof value!=='boolean')fail('INVALID_PREFERENCE');hidden=value;return apply();},
    pause(value){ensure();if(typeof value!=='boolean')fail('INVALID_PREFERENCE');paused=value;return apply();},
    reducedMotion(value){ensure();if(typeof value!=='boolean')fail('INVALID_PREFERENCE');manualReduced=value;return apply();},
    systemMotion(value){ensure();if(typeof value!=='boolean')fail('INVALID_PREFERENCE');systemReduced=value;return apply();},
    visibility(value){ensure();if(typeof value!=='boolean')fail('INVALID_PREFERENCE');tabHidden=value;return apply();},
    activity(kind){ensure();if(!activityTypes.has(kind))fail('INVALID_ACTIVITY');
      director.activity(kind);return snapshot();},
    dispose(){detached=true;return snapshot();}
  });
}
/**
 * Browser control wiring does not call preventDefault(), scroll(), focus(),
 * track clicks or mutate statutory source text. It never enables audio.
 */
export function bindCharacterMotionControls({preferences,document,pauseButton,hideButton,reduceButton,mediaQuery}={}){
  if(!preferences||typeof preferences.getSnapshot!=='function'||!document||
     typeof document.addEventListener!=='function'||typeof document.removeEventListener!=='function'||
     !pauseButton||!hideButton||!reduceButton||
     [pauseButton,hideButton,reduceButton].some(x=>typeof x.addEventListener!=='function'||typeof x.setAttribute!=='function'))
    fail('INVALID_BROWSER_CONTROLS');
  const listeners=[];
  const on=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push([target,type,fn]);};
  const refresh=()=>{
    const s=preferences.getSnapshot();
    pauseButton.setAttribute('aria-pressed',String(s.userPaused));
    pauseButton.textContent=s.userPaused?'Resume Bill':'Pause Bill';
    hideButton.setAttribute('aria-pressed',String(s.userHidden));
    hideButton.textContent=s.userHidden?'Show Bill':'Hide Bill';
    reduceButton.setAttribute('aria-pressed',String(s.userReducedMotion));
    reduceButton.textContent=s.userReducedMotion?'Allow essential motion only':'Reduce Bill motion';
  };
  on(pauseButton,'click',()=>{preferences.pause(!preferences.getSnapshot().userPaused);refresh();});
  on(hideButton,'click',()=>{preferences.hide(!preferences.getSnapshot().userHidden);refresh();});
  on(reduceButton,'click',()=>{preferences.reducedMotion(!preferences.getSnapshot().userReducedMotion);refresh();});
  const visibility=()=>{preferences.visibility(document.hidden===true);refresh();};
  on(document,'visibilitychange',visibility);
  const activityMap={pointerdown:'pointer',keydown:'keyboard',touchstart:'touch',focusin:'focus',selectionchange:'selection',wheel:'scroll'};
  for(const [name,kind] of Object.entries(activityMap))on(document,name,()=>preferences.activity(kind));
  let mqHandler=null;
  if(mediaQuery){
    if(typeof mediaQuery.matches!=='boolean'||typeof mediaQuery.addEventListener!=='function'||typeof mediaQuery.removeEventListener!=='function')
      fail('INVALID_MEDIA_QUERY');
    mqHandler=event=>{preferences.systemMotion(event.matches===true);refresh();};
    mediaQuery.addEventListener('change',mqHandler);
    preferences.systemMotion(mediaQuery.matches);
  }
  visibility();refresh();
  return Object.freeze({
    refresh,
    dispose(){
      for(const [el,type,cb] of listeners)el.removeEventListener(type,cb);
      if(mediaQuery&&mqHandler)mediaQuery.removeEventListener('change',mqHandler);
    }
  });
}
