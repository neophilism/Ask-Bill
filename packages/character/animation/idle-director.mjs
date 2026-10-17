/** Ask Bill opt-in idle antics and dance scheduling, no DOM/provider dependency.
 * Source-owned clip catalog from assets/bill/characters/animation-library.json.
 * Returns ONE transient GLB animation; renderer controls playback and in-place
 * world position. Every user activity takes priority and cancels the action.
 */
const CLOCK_LIMIT=Number.MAX_SAFE_INTEGER/4;
const validTime=x=>Number.isFinite(x)&&x>=0&&x<CLOCK_LIMIT;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

export function createIdleDirector({library,seed=1,startedAt=0}={}){
  if(!library||library.schemaVersion!==1||!Array.isArray(library.clips)||library.clips.length<10)
    throw new TypeError('A vetted Bill animation library is required');
  if(!validTime(startedAt)||!Number.isInteger(seed))throw new TypeError('Invalid director clock/seed');
  const byName=new Map();
  for(const clip of library.clips){
    if(!clip||typeof clip.name!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,50}$/.test(clip.name)||
      byName.has(clip.name)||!Number.isFinite(clip.durationSeconds)||clip.durationSeconds<=0||
      clip.durationSeconds>20)
      throw new TypeError('Unsafe animation catalog');
    byName.set(clip.name,clip);
  }
  const dances=library.clips.filter(x=>x.category==='dance'&&x.autoIdle===true);
  const ambient=library.clips.filter(x=>x.category==='ambient'&&x.autoIdle===true&&x.name!=='Idle');
  if(dances.length<5||ambient.length<3)throw new TypeError('Missing idle or dance performances');
  const policy=library.policy;
  if(!policy||![policy.idleMinSeconds,policy.idleMaxSeconds,
    policy.performanceCooldownMinSeconds,policy.performanceCooldownMaxSeconds,policy.danceChance].every(Number.isFinite)||
    policy.idleMinSeconds<10||policy.idleMaxSeconds<policy.idleMinSeconds||
    policy.performanceCooldownMinSeconds<30||policy.performanceCooldownMaxSeconds<policy.performanceCooldownMinSeconds||
    policy.danceChance<0||policy.danceChance>1)
    throw new TypeError('Unsafe automatic-motion policy');
  let rng=seed>>>0;
  const rand=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296};
  const between=(a,b)=>a+(b-a)*rand();
  let now=startedAt,lastActivity=startedAt,lastName=null,active=null,until=0,blocked=false;
  let nextAt=now+between(policy.idleMinSeconds,policy.idleMaxSeconds)*1000;
  const publicState=(reason='waiting')=>Object.freeze({
    clip:active,reason,lastName,remainingMs:active?Math.max(0,until-now):0,
    nextAt:active?until:nextAt,lastActivity,
  });

  function activity(at=now){
    if(!validTime(at)||at<now)throw new RangeError('Stale or invalid activity time');
    now=at;lastActivity=at;active=null;until=0;
    nextAt=at+between(policy.idleMinSeconds,policy.idleMaxSeconds)*1000;
    return publicState('interrupted');
  }
  function pick(collection){
    const eligible=collection.filter(x=>x.name!==lastName);
    const pool=eligible.length?eligible:collection;
    return pool[Math.min(pool.length-1,Math.floor(rand()*pool.length))];
  }
  function start(clip,at,reason){
    now=at;active=clip.name;lastName=clip.name;until=at+clip.durationSeconds*1000;
    return publicState(reason);
  }
  function tick(at,conditions={}){
    if(!validTime(at)||at<now)throw new RangeError('Nonmonotonic/invalid director clock');
    now=at;
    const c=conditions||{};
    const shouldBlock=c.enabled===false||c.visible===false||c.paused===true||
      c.reducedMotion===true||c.focused===true||c.hasSelection===true||
      c.questionActive===true||c.speechActive===true||c.pointerActive===true||
      c.manualAnimation===true||c.activeNavigation===true;
    if(shouldBlock){
      if(!blocked){activity(at);blocked=true;}
      active=null;until=0;
      return publicState('suppressed');
    }
    if(blocked){blocked=false;activity(at);return publicState('resumed');}
    if(active){
      if(at<until)return publicState('performing');
      // Return to quiet idle, then wait a long interval before the next antic.
      active=null;until=0;
      nextAt=at+between(policy.performanceCooldownMinSeconds,policy.performanceCooldownMaxSeconds)*1000;
      return publicState('finished');
    }
    if(at<nextAt)return publicState('waiting');
    const choice=rand()<policy.danceChance?pick(dances):pick(ambient);
    return start(choice,at,choice.category==='dance'?'dancing':'idle-gesture');
  }
  function auditionDance(at=now,conditions={}){
    const blockedByUser=conditions.visible===false||conditions.paused===true||
      conditions.reducedMotion===true||conditions.focused===true||
      conditions.hasSelection===true||conditions.questionActive===true||
      conditions.speechActive===true;
    if(!validTime(at)||at<now)throw new RangeError('Invalid audition time');
    if(blockedByUser){activity(at);return publicState('suppressed');}
    blocked=false;
    return start(pick(dances),at,'manual-dance');
  }
  function reset(at=now){blocked=false;return activity(at);}
  return Object.freeze({tick,activity,auditionDance,reset,state:()=>publicState()});
}
