/** AB-074: conservative per-device render quality and graphics resource lifecycle.
 * This module never loads unknown URLs and never turns rendering into a prerequisite for source reading.
 */
export class GraphicsPolicyError extends Error {
  constructor(code){super(code);this.name='GraphicsPolicyError';this.code=code;}
}
const deny=code=>{throw new GraphicsPolicyError(code)};
const tiers=['poster','low','medium','high'];
const costs=Object.freeze({poster:{triangles:0,materials:0,textureEdge:0},low:{triangles:12000,materials:6,textureEdge:1024},
  medium:{triangles:35000,materials:6,textureEdge:1024},high:{triangles:70000,materials:6,textureEdge:2048}});
const ordinal=t=>tiers.indexOf(t);
const oneOf=(v,values)=>values.includes(v);
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
/** Browser adapter supplies frame costs; model/citation output cannot choose graphics budgets. */
export function createGraphicsGovernor({device='desktop',initialTier='medium',frameBudgetMs,now=()=>Date.now()}={}){
  if(!oneOf(device,['desktop','mobile'])||!oneOf(initialTier,tiers)||typeof now!=='function'||
    (frameBudgetMs!==undefined&&!finite(frameBudgetMs,10,100)))deny('INVALID_GRAPHICS_CONFIG');
  const targetMs=frameBudgetMs??(device==='mobile'?40:24);
  let tier=device==='mobile'&&initialTier==='high'?'medium':initialTier;
  let lost=false,hidden=false,reducedData=false,disposed=false;
  let slow=0,windowFrames=0,lastSwitch=-Infinity,sequence=0,reason='initial';
  const nowSafe=()=>{const n=now();if(!Number.isSafeInteger(n)||n<0||n>9e15)deny('INVALID_CLOCK');return n;};
  const active=()=>{if(disposed)deny('GOVERNOR_DISPOSED');};
  const fallback=(next,why,clock)=>{if(ordinal(next)>=ordinal(tier))return false;tier=next;reason=why;lastSwitch=clock;sequence++;slow=0;windowFrames=0;return true;};
  const state=()=>Object.freeze({device,tier,reason,epoch:sequence,rendererAllowed:!disposed&&!hidden&&!lost&&tier!=='poster',
    sourceReadingAvailable:true,autoplayAllowed:false,renderSuspended:disposed||hidden||lost,
    reducedData,policy:Object.freeze({...costs[tier],frameBudgetMs:targetMs})});
  return Object.freeze({
    snapshot(){return state();},
    frame({durationMs,at}={}){
      active();const ts=at??nowSafe();if(!finite(ts,0,9e15)||!finite(durationMs,0,1000))deny('INVALID_FRAME');
      if(hidden||lost||tier==='poster')return state();
      slow+=durationMs>targetMs?1:0;windowFrames++;
      if(windowFrames>=36){
        if(slow>=24&&ts-lastSwitch>=10000){fallback(tiers[ordinal(tier)-1],'SUSTAINED_FRAME_OVERRUN',ts);}
        slow=0;windowFrames=0;
      }
      return state();
    },
    memoryPressure({estimatedBytes,limitBytes}={}){
      active();const ts=nowSafe();if(!Number.isSafeInteger(estimatedBytes)||!Number.isSafeInteger(limitBytes)||
        estimatedBytes<0||limitBytes<=0||limitBytes>2**34)deny('INVALID_MEMORY_ESTIMATE');
      if(estimatedBytes>=limitBytes*1.5)fallback('poster','MEMORY_CRITICAL',ts);
      else if(estimatedBytes>limitBytes)fallback(ordinal(tier)>1?'low':'poster','MEMORY_PRESSURE',ts);
      return state();
    },
    setReducedData(value){active();if(typeof value!=='boolean')deny('INVALID_PREFERENCE');reducedData=value;
      if(value)fallback(ordinal(tier)>1?'low':tier,'DATA_SAVER',nowSafe());return state();},
    setHidden(value){active();if(typeof value!=='boolean')deny('INVALID_PREFERENCE');hidden=value;return state();},
    contextLost(){active();lost=true;reason='CONTEXT_LOST';sequence++;return state();},
    recoverAfterValidatedReload(){active();if(!lost)deny('NO_CONTEXT_LOSS');lost=false;
      fallback(ordinal(tier)>1?'low':tier,'CONTEXT_RECOVERED_WITH_LOW_TIER',nowSafe());return state();},
    requestTier(value){active();if(!oneOf(value,tiers))deny('INVALID_TIER');
      if(ordinal(value)>ordinal(tier))deny('AUTOMATIC_QUALITY_UPGRADE_FORBIDDEN');
      fallback(value,'MANUAL_DOWNGRADE',nowSafe());return state();},
    dispose(){if(disposed)return state();disposed=true;tier='poster';reason='DISPOSED';sequence++;return state();}
  });
}
/** Select only metadata from an independently verified owned character manifest. */
export function selectCharacterLod({manifest,governorState}={}){
  if(!governorState||!oneOf(governorState.tier,tiers)||!manifest||!Array.isArray(manifest.lods)||manifest.lods.length>4)
    deny('INVALID_ASSET_MANIFEST');
  if(governorState.tier==='poster')return Object.freeze({kind:'poster',reason:governorState.reason});
  const budget=costs[governorState.tier];
  const allowed=manifest.lods.filter(x=>x&&oneOf(x.name,['low','medium','high'])&&
    Number.isSafeInteger(x.triangles)&&x.triangles>0&&x.triangles<=budget.triangles&&
    Number.isSafeInteger(x.materialCount)&&x.materialCount>0&&x.materialCount<=budget.materials&&
    typeof x.uri==='string'&&/^\/assets\/bill\/[a-zA-Z0-9/_-]+\.glb$/.test(x.uri)&&!x.uri.includes('..')&&
    typeof x.hash==='string'&&/^[a-f0-9]{64}$/.test(x.hash));
  const selected=allowed.sort((a,b)=>b.triangles-a.triangles)[0];
  if(!selected)return Object.freeze({kind:'poster',reason:'NO_BUDGET_COMPATIBLE_LOD'});
  return Object.freeze({kind:'glb',tier:selected.name,uri:selected.uri,hash:selected.hash});
}
