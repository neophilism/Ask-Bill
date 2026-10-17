/** AB-066: measured CSS-page to canvas coordinates; never accepts a model-supplied selector. */
export class ViewportGeometryError extends Error {
  constructor(code) { super(code); this.name='ViewportGeometryError'; this.code=code; }
}
const fail=code=>{throw new ViewportGeometryError(code)};
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=10000000;
const point=(value,code)=>{
  if(!value||!finite(value.x)||!finite(value.y))fail(code);
  return Object.freeze({x:value.x,y:value.y});
};
const rect=(value,code)=>{
  if(!value||![value.x,value.y,value.width,value.height].every(finite)||value.width<=0||value.height<=0)fail(code);
  return Object.freeze({x:value.x,y:value.y,width:value.width,height:value.height});
};
const version=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,190}$/.test(value);
const round=value=>Math.round(value*10000)/10000;
const freezePoint=(x,y)=>Object.freeze({x:round(x),y:round(y)});
function assertRevision(actual,expected){
  if(expected!==undefined && actual!==expected)fail('STALE_LAYOUT_REVISION');
}
/**
 * DOMRect values and window.scrollX/Y are in CSS layout-viewport pixels.
 * VisualViewport offsetLeft/Top locate the visual viewport within that layout
 * viewport; scale affects visible CSS dimensions but MUST NOT be applied a
 * second time to getBoundingClientRect or scroll coordinates.
 * Bitmap canvas dimensions are physical pixels and are converted exactly once.
 */
export function createViewportGeometry({versionId,layoutRevision,scroll,visualViewport,layoutViewport,canvasRect,canvasBitmap,safeInsets={top:0,right:0,bottom:0,left:0}}={}){
  if(!version(versionId))fail('VERSION_REQUIRED');
  if(!Number.isSafeInteger(layoutRevision)||layoutRevision<0)fail('REVISION_REQUIRED');
  const s=point(scroll,'INVALID_SCROLL');
  const layout=rect({x:0,y:0,width:layoutViewport?.width,height:layoutViewport?.height},'INVALID_VIEWPORT');
  const v=visualViewport??{offsetLeft:0,offsetTop:0,width:layout.width,height:layout.height,scale:1};
  if(![v.offsetLeft,v.offsetTop,v.width,v.height,v.scale].every(finite)||v.offsetLeft<0||v.offsetTop<0||v.width<=0||v.height<=0||v.scale<0.1||v.scale>10)fail('INVALID_VISUAL_VIEWPORT');
  if(v.offsetLeft+v.width>layout.width+1||v.offsetTop+v.height>layout.height+1)fail('VISUAL_VIEWPORT_OVERFLOW');
  const visual=Object.freeze({offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,width:v.width,height:v.height,scale:v.scale});
  const stage=rect(canvasRect,'INVALID_CANVAS');
  const pixels=canvasBitmap??{width:Math.round(stage.width),height:Math.round(stage.height)};
  if(![pixels.width,pixels.height].every(x=>Number.isSafeInteger(x)&&x>0&&x<=16384))fail('INVALID_CANVAS_BITMAP');
  if(!safeInsets||!['top','right','bottom','left'].every(k=>finite(safeInsets[k])&&safeInsets[k]>=0))fail('INVALID_SAFE_INSETS');
  if(safeInsets.left+safeInsets.right>=visual.width||safeInsets.top+safeInsets.bottom>=visual.height)fail('INVALID_SAFE_INSETS');
  const insets=Object.freeze({...safeInsets});
  const safe=Object.freeze({x:visual.offsetLeft+insets.left,y:visual.offsetTop+insets.top,width:visual.width-insets.left-insets.right,height:visual.height-insets.top-insets.bottom});
  const visibleBounds=rect(safe,'INVALID_SAFE_VIEWPORT');
  const clientToCanvas=client=>{
    const p=point(client,'INVALID_CLIENT_POINT');
    return freezePoint((p.x-stage.x)*pixels.width/stage.width,(p.y-stage.y)*pixels.height/stage.height);
  };
  const pageToClient=p=>{const q=point(p,'INVALID_PAGE_POINT');return freezePoint(q.x-s.x,q.y-s.y)};
  const pageToCanvas=p=>clientToCanvas(pageToClient(p));
  const visualToCanvas=p=>{const q=point(p,'INVALID_VISUAL_POINT');return clientToCanvas({x:q.x+visual.offsetLeft,y:q.y+visual.offsetTop})};
  const canvasToPage=p=>{const q=point(p,'INVALID_CANVAS_POINT');return freezePoint(q.x*stage.width/pixels.width+stage.x+s.x,q.y*stage.height/pixels.height+stage.y+s.y)};
  const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  const anchorToCanvas=(anchor,{expectedRevision=layoutRevision}={})=>{
    assertRevision(layoutRevision,expectedRevision);
    if(!anchor||anchor.versionId!==versionId||anchor.sourceVersionId&&anchor.sourceVersionId!==versionId)fail('VERSION_MISMATCH');
    if(anchor.layoutRevision!==layoutRevision)fail('STALE_LAYOUT_REVISION');
    if(!anchor.visible)return Object.freeze({kind:'dock',reason:'ANCHOR_NOT_VISIBLE',versionId,layoutRevision});
    const client=rect(anchor.viewportRect,'INVALID_ANCHOR_RECT');
    const page=rect(anchor.pageRect,'INVALID_ANCHOR_RECT');
    if(Math.abs(page.x-client.x-s.x)>.5||Math.abs(page.y-client.y-s.y)>.5||Math.abs(page.width-client.width)>.5||Math.abs(page.height-client.height)>.5)fail('ANCHOR_POSITION_MISMATCH');
    if(!intersects(client,visibleBounds))return Object.freeze({kind:'dock',reason:'ANCHOR_OFFSCREEN',versionId,layoutRevision});
    const left=Math.max(client.x,safe.x),top=Math.max(client.y,safe.y);
    const right=Math.min(client.x+client.width,safe.x+safe.width),bottom=Math.min(client.y+client.height,safe.y+safe.height);
    if(right<=left||bottom<=top)return Object.freeze({kind:'dock',reason:'ANCHOR_OFFSCREEN',versionId,layoutRevision});
    const contact=clientToCanvas({x:(left+right)/2,y:bottom});
    return Object.freeze({kind:'target',versionId,layoutRevision,provisionId:anchor.provisionId,contact,clipped:right-left<client.width||bottom-top<client.height,stageSize:Object.freeze({width:pixels.width,height:pixels.height})});
  };
  return Object.freeze({versionId,layoutRevision,scroll:s,visualViewport:visual,safeViewport:safe,canvasRect:stage,canvasBitmap:Object.freeze({...pixels}),pageToClient,pageToCanvas,visualToCanvas,canvasToPage,anchorToCanvas,assertRevision:expected=>assertRevision(layoutRevision,expected)});
}
