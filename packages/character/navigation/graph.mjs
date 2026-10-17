/** AB-067: bounded page navigation graph from client-measured ledges, never LLM coordinates. */
export class NavigationGraphError extends Error {
  constructor(code){super(code);this.code=code;this.name='NavigationGraphError';}
}
const fail=code=>{throw new NavigationGraphError(code)};
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const VERSION=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/;
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000000;
const acceptable=new Set(['text','input','link','selection','caption','sticky','popover','keyboard','safe-area','focus','other']);
function validateRect(r){
 if(!r||![r.x,r.y,r.width,r.height].every(finite)||r.width<=0||r.height<=0)fail('INVALID_RECT');
 return Object.freeze({x:r.x,y:r.y,width:r.width,height:r.height});
}
function allowedKeys(obj,keys){
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k)))fail('UNTRUSTED_GEOMETRY_FIELD');
}
function inflate(r,p){return {x:r.x-p,y:r.y-p,width:r.width+2*p,height:r.height+2*p};}
function within(p,r){return p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;}
function intersectsSegment(a,b,r){
 // Liang-Barsky; inclusive contact with protected regions is unsafe.
 const dx=b.x-a.x,dy=b.y-a.y;
 let lower=0,upper=1;
 for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.width-a.x],[-dy,a.y-r.y],[dy,r.y+r.height-a.y]]){
  if(Math.abs(p)<1e-10){if(q<=0)return true;continue;}
  const t=q/p;
  if(p<0){if(t>upper)return false;lower=Math.max(lower,t);}
  else{if(t<lower)return false;upper=Math.min(upper,t);}
 }
 return lower<=upper;
}
export function buildTraversalGraph({versionId,layoutRevision,viewport,surfaces,obstacles=[],bodyRadius=12,maxStep=55}={}){
 if(typeof versionId!=='string'||!VERSION.test(versionId))fail('VERSION_REQUIRED');
 if(!Number.isSafeInteger(layoutRevision)||layoutRevision<0)fail('REVISION_REQUIRED');
 const area=validateRect(viewport);
 if(!Array.isArray(surfaces)||surfaces.length<1||surfaces.length>80)fail('SURFACE_LIMIT');
 if(!Array.isArray(obstacles)||obstacles.length>160)fail('OBSTACLE_LIMIT');
 if(!finite(bodyRadius)||bodyRadius<0||bodyRadius>60||!finite(maxStep)||maxStep<=0||maxStep>200)fail('PLANNER_LIMIT');
 const normalized=[];const ids=new Set();
 for(const s of surfaces){
  allowedKeys(s,['id','versionId','layoutRevision','kind','rect','scrollContainerId']);
  if(!ID.test(s.id)||ids.has(s.id)||s.versionId!==versionId||s.layoutRevision!==layoutRevision||s.kind!=='ledge')fail('INVALID_SURFACE');
  if(typeof s.scrollContainerId!=='string'||!ID.test(s.scrollContainerId))fail('INVALID_SCROLL_CONTAINER');
  ids.add(s.id);
  const r=validateRect(s.rect);
  // Safe foot and body clearance is checked against viewport and obstacles below.
  normalized.push({id:s.id,container:s.scrollContainerId,rect:r});
 }
 const protectedRects=obstacles.map(o=>{
  allowedKeys(o,['kind','rect','versionId','layoutRevision']);
  if(!acceptable.has(o.kind)||o.versionId!==versionId||o.layoutRevision!==layoutRevision)fail('INVALID_OBSTACLE');
  return Object.freeze({kind:o.kind,rect:validateRect(o.rect)});
 });
 const blockers=protectedRects.map(o=>inflate(o.rect,bodyRadius));
 const safe={x:area.x+bodyRadius,y:area.y+bodyRadius,width:area.width-2*bodyRadius,height:area.height-2*bodyRadius};
 if(safe.width<=0||safe.height<=0)fail('NO_SAFE_VIEWPORT');
 const safePoint=p=>within(p,safe)&&!blockers.some(z=>within(p,z));
 const safeSegment=(a,b)=>safePoint(a)&&safePoint(b)&&!blockers.some(z=>intersectsSegment(a,b,z));
 const nodes=[];let candidates=0;
 for(const s of normalized){
  const r=s.rect;
  if(r.width<2*bodyRadius+8)continue;
  const offsets=[bodyRadius+4,r.width/2,r.width-bodyRadius-4];
  for(let i=0;i<offsets.length;i++){
   const p={x:r.x+offsets[i],y:r.y+r.height};
   candidates++;
   if(safePoint(p))nodes.push(Object.freeze({id:s.id+':'+i,surfaceId:s.id,scrollContainerId:s.container,x:p.x,y:p.y}));
  }
 }
 if(candidates>240||nodes.length>240)fail('NODE_LIMIT');
 const edges=[];
 const edgeKey=new Set();
 function connect(a,b){
  if(a.scrollContainerId!==b.scrollContainerId)return;
  const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
  if(a.surfaceId!==b.surfaceId&&(dx>maxStep||dy>maxStep||Math.hypot(dx,dy)>1.45*maxStep))return;
  if(!safeSegment(a,b))return;
  const pair=[a.id,b.id].sort().join('|');if(edgeKey.has(pair))return;
  edgeKey.add(pair);edges.push(Object.freeze({from:a.id,to:b.id,cost:Math.round(Math.hypot(dx,dy)*1000)/1000}));
 }
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  if(edges.length>=1200)fail('EDGE_LIMIT');
  const a=nodes[i],b=nodes[j];
  if(a.surfaceId===b.surfaceId){
   // Connect neighbors; do not skip blocked intermediate nodes.
   if(Math.abs(+a.id.split(':').at(-1)- +b.id.split(':').at(-1))===1)connect(a,b);
  }else connect(a,b);
 }
 const byNode=new Map(nodes.map(n=>[n.id,[]]));
 for(const edge of edges){byNode.get(edge.from).push({id:edge.to,cost:edge.cost});byNode.get(edge.to).push({id:edge.from,cost:edge.cost});}
 const adjacency=Object.freeze(Object.fromEntries([...byNode].map(([id,neighbors])=>[id,Object.freeze(neighbors.sort((a,b)=>a.id.localeCompare(b.id)).map(n=>Object.freeze(n)))])));
 const reachable=(from,to)=>{
  if(!byNode.has(from)||!byNode.has(to))return Object.freeze({kind:'dock',reason:'TARGET_NOT_WALKABLE'});
  const seen=new Set([from]),queue=[from];
  for(const id of queue){if(id===to)return Object.freeze({kind:'route-possible',versionId,layoutRevision});for(const n of adjacency[id])if(!seen.has(n.id)){seen.add(n.id);queue.push(n.id);}}
  return Object.freeze({kind:'dock',reason:'NO_SAFE_PATH'});
 };
 return Object.freeze({versionId,layoutRevision,nodes:Object.freeze(nodes),edges:Object.freeze(edges),adjacency,protectedCount:blockers.length,reachable});
}
