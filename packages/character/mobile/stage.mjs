/** AB-073: pure local layout policy for Bill's mobile dock and safe nearby stage.
 * No DOM lookups, page scrolling, text mutation, or model-supplied coordinates.
 */
export class MobileStageError extends Error {
  constructor(code) { super(code); this.code=code; this.name='MobileStageError'; }
}
const deny=code=>{throw new MobileStageError(code)};
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
function rect(v,name){
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['x','y','width','height'].includes(k))||
    !['x','y','width','height'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&Math.abs(v[k])<=100000)||
    v.width<0||v.height<0)deny('INVALID_RECT_'+name.toUpperCase());
  return {x:v.x,y:v.y,width:v.width,height:v.height};
}
const overlap=(a,b,pad=0)=>a.x<b.x+b.width+pad&&a.x+a.width+pad>b.x&&a.y<b.y+b.height+pad&&a.y+a.height+pad>b.y;
const contained=(child,parent)=>child.x>=parent.x&&child.y>=parent.y&&child.x+child.width<=parent.x+parent.width&&child.y+child.height<=parent.y+parent.height;
const token=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
/**
 * The supplied viewport/geometry must come from a trusted browser layout adapter.
 * Motion only within registered whitespace, never across arbitrary legal text.
 */
export function planMobileStage({viewport,safeArea={top:0,right:0,bottom:0,left:0},
    dockRect,obstacles=[],focusRect=null,selectionRect=null,keyboardTop=null,
    motion={},versionId,layoutRevision=0,sourceTarget=null,allowedSurfaces=[]}={}){
  const view=rect(viewport,'viewport');
  if(view.width<240||view.height<200||view.width>10000||view.height>10000||
    !integer(layoutRevision,0,1000000000)||typeof versionId!=='string'||!token.test(versionId))deny('INVALID_LAYOUT_CONTEXT');
  if(!safeArea||typeof safeArea!=='object'||Array.isArray(safeArea)||Object.keys(safeArea).some(k=>!['top','left','right','bottom'].includes(k))||
    !['top','right','bottom','left'].every(k=>typeof safeArea[k]==='number'&&Number.isFinite(safeArea[k])&&safeArea[k]>=0&&safeArea[k]<=200))deny('INVALID_SAFE_AREA');
  if(!motion||typeof motion!=='object'||Array.isArray(motion)||Object.keys(motion).some(k=>!['hidden','paused','reduced','following','userActive'].includes(k))||
    Object.values(motion).some(v=>typeof v!=='boolean'))deny('INVALID_MOTION_PREFERENCES');
  if(!Array.isArray(obstacles)||obstacles.length>250||!Array.isArray(allowedSurfaces)||allowedSurfaces.length>30)deny('LAYOUT_BUDGET');
  const obs=obstacles.map((x,i)=>rect(x,'obstacle'+i));
  if(focusRect)obs.push(rect(focusRect,'focus'));
  if(selectionRect)obs.push(rect(selectionRect,'selection'));
  if(keyboardTop!==null&&(typeof keyboardTop!=='number'||!Number.isFinite(keyboardTop)||keyboardTop<view.y||keyboardTop>view.y+view.height))deny('INVALID_KEYBOARD_GEOMETRY');
  const availableHeight=Math.min(view.y+view.height-safeArea.bottom,keyboardTop??Infinity)-view.y-safeArea.top;
  const allowed={x:view.x+safeArea.left,y:view.y+safeArea.top,width:view.width-safeArea.left-safeArea.right,height:availableHeight};
  if(allowed.width<0||allowed.height<0)deny('INVALID_SAFE_AREA');
  const hidden=motion.hidden===true;
  if(hidden)return Object.freeze({mode:'hidden',reason:'VISITOR_HID_BILL',versionId,layoutRevision,rect:null,travel:[],scrollAllowed:false,canMove:false});
  const requestedDock=rect(dockRect,'dock');
  const dock=contained(requestedDock,allowed)&&requestedDock.width>=36&&requestedDock.height>=36&&
    requestedDock.width<=190&&requestedDock.height<=220&&!obs.some(o=>overlap(dockRect,o,4));
  const docHasSpace=availableHeight>=260&&allowed.width>=240;
  if(!dock || !docHasSpace) return Object.freeze({mode:'hidden',reason:'NO_SAFE_DOCK_SPACE',versionId,layoutRevision,rect:null,travel:[],scrollAllowed:false,canMove:false});
  const outBase={versionId,layoutRevision,scrollAllowed:false};
  const dockResult=(reason)=>Object.freeze({...outBase,mode:'docked',reason,rect:Object.freeze(requestedDock),travel:Object.freeze([]),canMove:false});
  if(motion.paused||motion.reduced||motion.userActive||keyboardTop!==null||focusRect||selectionRect)return dockResult('USER_OR_ACCESSIBILITY_PRIORITY');
  if(!motion.following||sourceTarget===null)return dockResult('FOLLOW_NOT_REQUESTED');
  if(!sourceTarget||typeof sourceTarget!=='object'||Array.isArray(sourceTarget)||
     Object.keys(sourceTarget).some(k=>!['versionId','layoutRevision','surfaceId'].includes(k))||
     sourceTarget.versionId!==versionId||sourceTarget.layoutRevision!==layoutRevision||
     typeof sourceTarget.surfaceId!=='string'||!token.test(sourceTarget.surfaceId))return dockResult('STALE_OR_UNTRUSTED_TARGET');
  const surface=allowedSurfaces.find(s=>s?.id===sourceTarget.surfaceId&&s.versionId===versionId&&s.layoutRevision===layoutRevision);
  if(!surface || surface.kind!=='whitespace')return dockResult('TARGET_NOT_REGISTERED');
  const target=rect(surface.rect,'surface');
  if(!contained(target,allowed)||target.width<requestedDock.width+16||target.height<requestedDock.height+16)return dockResult('TARGET_NOT_VISIBLE');
  const destination={x:target.x+(target.width-requestedDock.width)/2,y:target.y+(target.height-requestedDock.height)/2,width:requestedDock.width,height:requestedDock.height};
  if(!contained(destination,target)||obs.some(o=>overlap(destination,o,12))||
    (view.width<540&&destination.y<view.y+100))return dockResult('TARGET_OCCUPIED');
  // Cross-page locomotion is forbidden here: future path-graph work can verify waypoints.
  return Object.freeze({...outBase,mode:'nearby',reason:'REGISTERED_WHITESPACE',rect:Object.freeze(destination),travel:Object.freeze([]),canMove:false});
}
