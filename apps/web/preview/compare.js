/** Ask Bill's local, privacy-preserving 3-up GLB walking lab.
 * The character style influences presentation only; never alters legal truth.
 */
import { safeRoster, normalizeShortlist, toggleShortlist, feedbackJson, MAX_SHORTLIST } from '../../../packages/character/gallery/shortlist.mjs';
import { createIdleDirector } from '../../../packages/character/animation/idle-director.mjs';
const $=id=>document.getElementById(id);
const actorIds=['bill-10','bill-12','bill-14'];
const modelBase=new URL('../../../assets/bill/characters/dist/',import.meta.url);
const referenceBase=new URL('../../../assets/bill/characters/reference/',import.meta.url);
const clock=performance.now();
const reducedSystem=window.matchMedia('(prefers-reduced-motion: reduce)');
let roster=[],selection=[...actorIds],controllers=[],directors=[],shortlist=[],chosen='bill-10',motionLibrary=null;
let paused=false,reduced=reducedSystem.matches,last=clock,autoIdle=true;
const automaticClips=[null,null,null];
const elapsed=()=>performance.now()-clock;
function activity(){const t=elapsed();for(const d of directors)d?.activity(t);for(let i=0;i<3;i++){const had=automaticClips[i]!==null;automaticClips[i]=null;if(had)setActiveClip(i,$('animation').value);}}
function activeClip(i){return automaticClips[i]||$('animation').value;}
function setActiveClip(i,name){const v=$('viewer-'+i);if(v.getAttribute('animation-name')!==name){v.setAttribute('animation-name',name);try{if('currentTime' in v)v.currentTime=0;}catch{}}if(paused||reduced||document.hidden)pause(i);else play(i);}
function fillClips(){const sel=$('animation');sel.replaceChildren();for(const clip of motionLibrary.clips){const o=document.createElement('option');o.value=clip.name;o.textContent=clip.name.replace(/([a-z])([A-Z])/g,'$1 $2')+' — '+clip.category;sel.append(o);}sel.value='WalkFunny';}
const validIds=()=>roster.map(x=>x.id);
function loadStored(key,otherwise) {try{const value=JSON.parse(localStorage.getItem(key));return value===null?otherwise:value}catch{return otherwise}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function status(message){$('global-status').textContent=message;}
function play(i){
 const v=$('viewer-'+i);
 if(!v || !v.play || paused || reduced || document.hidden)return;
 try{const result=v.play();if(result && typeof result.catch==='function')result.catch(()=>{})}catch{}
}
function pause(i){const v=$('viewer-'+i);try{if(v && v.pause)v.pause()}catch{}}
function syncAnimations(){
 for(let i=0;i<3;i++){
  setActiveClip(i,activeClip(i));
  if(paused || reduced || document.hidden)pause(i);else play(i);
  controllers[i]?.setPaused(paused || document.hidden);
  controllers[i]?.setReducedMotion(reduced);
 }
 $('pause').setAttribute('aria-pressed',String(paused));
 $('motion').setAttribute('aria-pressed',String(reduced));
}
function controllersReset(){
 for(let i=0;i<3;i++){
  const stage=$('stage-'+i);
  const width=Math.max(40,stage.clientWidth-174);
  const height=Math.max(40,stage.clientHeight-284);
  const c=window.BillAttention.createAttention({width,height,start:{x:width/2,y:height/2},maxSpeed:115,seed:101+i*73});
  c.setVersion('comparison-source-v1');c.setPaused(paused);c.setReducedMotion(reduced);
  controllers[i]=c;
 }
}
function selectedCard(i) {return roster.find(item=>item.id===selection[i]);}
function showCard(i){
 const record=selectedCard(i);if(!record)return;
 const viewer=$('viewer-'+i);
 viewer.alt='3D animation of '+record.name;
 viewer.setAttribute('src',new URL(record.id+'.glb',modelBase).href);
 viewer.setAttribute('animation-name',activeClip(i));
 $('choice-'+i).value=record.id;
 $('persona-'+i).textContent=record.name+' — '+record.form+'. '+record.personality;
 const ref=$('reference-'+i);
 const n=Number(record.id.slice(-2));
 if(n<=10){
  ref.hidden=false;
  $('ref-image-'+i).src=new URL('original-'+String(n).padStart(2,'0')+'.jpg',referenceBase).href;
  $('ref-image-'+i).alt='Original Option '+n+' face reference, cropped from the concept illustration';
 }else{ref.hidden=true;$('ref-image-'+i).removeAttribute('src');}
 $('shortlist-'+i).textContent=shortlist.includes(record.id)?'Remove from shortlist':'Add to shortlist';
 $('shortlist-'+i).setAttribute('aria-pressed',String(shortlist.includes(record.id)));
 $('default-'+i).textContent=chosen===record.id?'My chosen Bill':'Use as my Bill';
 $('default-'+i).setAttribute('aria-pressed',String(chosen===record.id));
 if(paused||reduced)pause(i);else play(i);
}
function drawShortlist(){
 $('count').textContent=shortlist.length+' / '+MAX_SHORTLIST;
 const host=$('shortlist');host.replaceChildren();
 if(!shortlist.length){const p=document.createElement('span');p.textContent='No favorites yet.';host.append(p);}
 for(const id of shortlist){
  const record=roster.find(x=>x.id===id);if(!record)continue;
  const b=document.createElement('button');b.type='button';
  b.textContent=record.name+' ×';b.title='Remove '+record.name+' from shortlist';
  b.addEventListener('click',()=>updateShortlist(id));host.append(b);
 }
 for(let i=0;i<3;i++)showCard(i);
}
function updateShortlist(id){
 const changed=toggleShortlist(shortlist,id,validIds());
 if(changed.error){status(changed.error);return;}
 shortlist=changed.list;save('bill-shortlist-v1',shortlist);
 drawShortlist();
 status(shortlist.length+' of seven shortlisted. Your choice is stored on this device only.');
}
function chooseSlot(i,id){
 if(!validIds().includes(id))return;
 activity();
 selection[i]=id;save('bill-comparison-lineup-v1',selection);showCard(i);
 status('Showing '+roster.find(x=>x.id===id).name+' in stage '+(i+1)+'.');
}
function chooseDefault(i){
 activity();
 chosen=selection[i];save('bill-selected',chosen);
 for(let j=0;j<3;j++)showCard(j);
 status('Your preferred Bill is now '+selectedCard(i).name+'. You can change it any time.');
}
function exportFeedback(){
 const body=feedbackJson(shortlist,roster,chosen);
 const blob=new Blob([body],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='ask-bill-my-shortlist.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 $('export-status').textContent='Saved a local JSON file containing only chosen character IDs and public names/styles.';
}
function tick(now){
 const dt=Math.max(0,Math.min(50,now-last)),t=elapsed();last=now;
 for(let i=0;i<controllers.length;i++){
  const c=controllers[i],s=c.tick(dt,t);
  const manual=!['WalkFunny','Idle'].includes($('animation').value);
  const d=directors[i]?.tick(t,{enabled:autoIdle,visible:!document.hidden,paused,
     reducedMotion:reduced,focused:!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'),
     hasSelection:s.hasSelection,manualAnimation:manual,
     activeNavigation:s.mode==='following'||s.mode==='approach_selection'});
  const next=d?.clip||null;
  if(next!==automaticClips[i]){
    automaticClips[i]=next;setActiveClip(i,activeClip(i));
  }
  // In-place dance clips own the body pose, so freeze stage travel.
  c.setPaused(paused||document.hidden||Boolean(next));
  $('actor-'+i).style.transform='translate3d('+s.x.toFixed(1)+'px,'+s.y.toFixed(1)+'px,0)';
  $('move-'+i).textContent=next?('Performing '+next):((reduced?'Reduced motion':s.mode)+' · '+Math.round(s.speed)+' px/s');
 }
 requestAnimationFrame(tick);
}
function selectExample(){
 const s=window.getSelection();if(!s || s.isCollapsed || !s.rangeCount)return;
 const source=$('source-text'),range=s.getRangeAt(0);
 if(!source.contains(range.commonAncestorContainer))return;
 const text=range.toString().trim();
 if(!text || text.length>800)return;
 const prefix=range.cloneRange();prefix.selectNodeContents(source);prefix.setEnd(range.startContainer,range.startOffset);
 const start=prefix.toString().length;
 activity();
 // Only the trusted fixture DOM adapter sets validated:true. No LLM
 // input or arbitrary selector is involved.
 const success=controllers.map((c,i)=>c.setSelection({
  validated:true,version:'comparison-source-v1',x:Math.min(35,c.state().x+15),y:25,
  start,end:start+range.toString().length
 })).some(Boolean);
 if(!success)return;
 $('selected-text').textContent='Bill noticed the selected example: '+text.slice(0,150);
 $('animation').value='Point';syncAnimations();
}
async function init(){
 if(!window.BillAttention){status('Motion controller could not be loaded.');return;}
 try{
  const r=await fetch(new URL('manifest.json',modelBase),{cache:'no-store'});
  if(!r.ok)throw Error('Character manifest unavailable');
  const data=await r.json();roster=safeRoster(data);
  const libraryResponse=await fetch(new URL('../../../assets/bill/characters/animation-library.json',import.meta.url),{cache:'no-store'});
  if(!libraryResponse.ok)throw Error('Animation library unavailable');
  motionLibrary=await libraryResponse.json();
  fillClips();
  chosen=loadStored('bill-selected','bill-10');if(!validIds().includes(chosen))chosen='bill-10';
  shortlist=normalizeShortlist(loadStored('bill-shortlist-v1',loadStored('bill-favorites',[])),validIds());
  const remembered=loadStored('bill-comparison-lineup-v1',actorIds);
  if(Array.isArray(remembered) && remembered.length===3 && remembered.every(x=>validIds().includes(x))) selection=[...remembered];
  for(let i=0;i<3;i++){
   const select=$('choice-'+i);select.replaceChildren();
   for(const item of roster){
    const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.id.slice(-2)+' · '+item.name+' ('+item.form+')';
    select.append(opt);
   }
   select.addEventListener('change',()=>chooseSlot(i,select.value));
   $('shortlist-'+i).addEventListener('click',()=>updateShortlist(selection[i]));
   $('default-'+i).addEventListener('click',()=>chooseDefault(i));
   $('stage-'+i).addEventListener('pointermove',e=>{
    if(!controllers[i])return;
    const box=$('stage-'+i).getBoundingClientRect();
    controllers[i].setPointer({x:e.clientX-box.left-85,y:e.clientY-box.top-130},performance.now()-clock);
   });
   $('viewer-'+i).addEventListener('load',()=>play(i));
   $('viewer-'+i).addEventListener('error',()=>status('A GLB could not load. Check the renderer connection and asset route.'));
  }
  controllersReset();directors=[0,1,2].map(i=>createIdleDirector({library:motionLibrary,seed:313+i*37,startedAt:0}));
  for(let i=0;i<3;i++)showCard(i);drawShortlist();
  $('animation').addEventListener('change',()=>{activity();syncAnimations();});
  $('auto-idle').addEventListener('click',()=>{
    autoIdle=!autoIdle;activity();$('auto-idle').setAttribute('aria-pressed',String(autoIdle));
    $('auto-idle').textContent='Automatic idle antics: '+(autoIdle?'on':'off');
    syncAnimations();
  });
  for(let i=0;i<3;i++)$('dance-'+i).addEventListener('click',()=>{
    if(paused||reduced||document.hidden){status('Unpause and enable motion to audition dances.');return;}
    // Explicit dance request may supersede a previous passage selection.
    controllers[i].clearSelection();
    activity();$('animation').value='WalkFunny';syncAnimations();
    const d=directors[i].auditionDance(elapsed());
    automaticClips[i]=d.clip;setActiveClip(i,d.clip);
    status('Stage '+(i+1)+' performs '+d.clip+'. All dances are in-place and silent.');
  });
  $('pause').addEventListener('click',()=>{activity();paused=!paused;syncAnimations();});
  $('motion').addEventListener('click',()=>{activity();reduced=!reduced;syncAnimations();});
  $('reset').addEventListener('click',()=>{activity();selection=[...actorIds];save('bill-comparison-lineup-v1',selection);for(let i=0;i<3;i++)showCard(i);status('Original comparison lineup restored.');});
  $('export').addEventListener('click',exportFeedback);
  window.addEventListener('resize',()=>{activity();controllersReset();syncAnimations();});
  for(const event of ['pointermove','pointerdown','keydown','touchstart','wheel','focusin']){
    document.addEventListener(event,activity,{passive:true});
  }
  document.addEventListener('visibilitychange',()=>{activity();syncAnimations();});
  document.addEventListener('mouseup',selectExample);
  document.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow')||e.key==='Shift')selectExample();});
  if(reducedSystem.addEventListener)reducedSystem.addEventListener('change',e=>{activity();reduced=e.matches;syncAnimations();});
  syncAnimations();requestAnimationFrame(tick);
  status('Loaded 20 real GLB candidates. Compare three at once; shortlist at most seven.');
  setTimeout(()=>{if(!customElements.get('model-viewer'))status('3D renderer could not load. An internet connection is currently required for model-viewer.');},6000);
 }catch(e){status('Could not load walking comparison: '+e.message);}
}
init();
