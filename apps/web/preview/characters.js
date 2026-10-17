import { createIdleDirector } from '../../../packages/character/animation/idle-director.mjs';
(()=>{'use strict';const $=id=>document.getElementById(id),stage=$('arena'),actor=$('actor'),viewer=$('viewer');let roster=[],selected=null,filter='all',playing=true,follow=true,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,favorites=[];try{favorites=JSON.parse(localStorage.getItem('bill-favorites')||'[]')}catch{}
const scriptRoot=new URL('../../../',location.href), assetBase=new URL('assets/bill/characters/dist/',scriptRoot);
let controller=null,clock=performance.now(),last=clock,library=null,director=null,autoIdle=true,automaticClip=null;
const elapsed=()=>performance.now()-clock;
function activity(){if(director)director.activity(elapsed());const had=automaticClip!==null;automaticClip=null;if(had)playClip();}
function playClip(){
 const next=automaticClip||$('clip').value;
 if(viewer.getAttribute('animation-name')!==next){
  viewer.setAttribute('animation-name',next);
  try{if('currentTime' in viewer)viewer.currentTime=0;}catch{}
 }
 if(!playing||reduce||document.hidden){if(typeof viewer.pause==='function')viewer.pause();}
 else if(typeof viewer.play==='function')viewer.play();
}
function fillClips(){
 const control=$('clip');control.replaceChildren();
 for(const clip of library.clips){
  const option=document.createElement('option');option.value=clip.name;
  option.textContent=clip.name.replace(/([a-z])([A-Z])/g,'$1 $2')+' — '+clip.category;
  control.append(option);
 }
 control.value='WalkFunny';
}
function resetController(){const width=Math.max(250,stage.clientWidth-235),height=Math.max(200,stage.clientHeight-360);controller=window.BillAttention.createAttention({width,height,start:{x:width/2,y:10},seed:17,maxSpeed:120});controller.setVersion('audition-v1');controller.setReducedMotion(reduce);controller.setPaused(!playing);$('reduce').setAttribute('aria-pressed',String(reduce));}
function persist(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function choose(id){const item=roster.find(x=>x.id===id);if(!item)return;activity();selected=item;$('chosen').textContent=item.name;$('name').textContent=item.name;$('details').textContent=`#${item.id.slice(-2)} · ${item.form} · ${item.style}`;$('persona').textContent=`Suggested personality: ${item.personality}`;viewer.setAttribute('src',new URL(item.id+'.glb',assetBase).href);viewer.alt=`3D character: ${item.name}`;viewer.setAttribute('animation-name',$('clip').value);playClip();$('download').href=viewer.getAttribute('src');$('download').download=item.id+'.glb';$('favorite').setAttribute('aria-pressed',String(favorites.includes(id)));$('favorite').textContent=(favorites.includes(id)?'★':'☆')+' Favorite';persist('bill-selected',item.id);renderList();}
function renderList(){const items=roster.filter(x=>filter==='all'||(filter==='original'&&Number(x.id.slice(-2))<=10)||(filter==='alternative'&&Number(x.id.slice(-2))>10)||(filter==='starred'&&favorites.includes(x.id)));$('list').replaceChildren();for(const x of items){const b=document.createElement('button');b.className='character';b.classList.toggle('selected',x.id===selected?.id);b.setAttribute('aria-pressed',String(x.id===selected?.id));const h=document.createElement('strong');h.textContent=x.id.slice(-2)+' '+x.name;const p=document.createElement('span');p.textContent=x.form+(favorites.includes(x.id)?' ★':'');b.append(h,p);b.addEventListener('click',()=>choose(x.id));$('list').append(b);} }
for(const id of ['all','original','alternative','starred'])$(id).addEventListener('click',()=>{filter=id;for(const j of ['all','original','alternative','starred'])$(j).setAttribute('aria-pressed',String(j===id));renderList()});
$('favorite').addEventListener('click',()=>{if(!selected)return;favorites=favorites.includes(selected.id)?favorites.filter(x=>x!==selected.id):favorites.concat([selected.id]);persist('bill-favorites',favorites);choose(selected.id)});
$('clip').addEventListener('change',()=>{activity();playClip()});
$('follow').addEventListener('click',()=>{follow=true;$('follow').setAttribute('aria-pressed','true');$('wander').setAttribute('aria-pressed','false')});
$('wander').addEventListener('click',()=>{follow=false;controller?.cancel();$('follow').setAttribute('aria-pressed','false');$('wander').setAttribute('aria-pressed','true')});
$('pause').addEventListener('click',()=>{activity();playing=!playing;controller?.setPaused(!playing);playClip();$('pause').setAttribute('aria-pressed',String(!playing));$('pause').textContent=playing?'Pause movement':'Resume movement'});
$('reduce').addEventListener('click',()=>{activity();reduce=!reduce;controller?.setReducedMotion(reduce);playClip();$('reduce').setAttribute('aria-pressed',String(reduce))});
stage.addEventListener('pointermove',e=>{if(!follow||!controller)return;const r=stage.getBoundingClientRect();controller.setPointer({x:e.clientX-r.left-90,y:e.clientY-r.top-130},performance.now()-clock)});
window.addEventListener('resize',()=>{activity();resetController();});
let lastAnnounced='';
function step(now){
 if(controller){
  const state=controller.tick(Math.min(50,Math.max(0,now-last)),elapsed());
  const automatic=director?.tick(elapsed(),{
   enabled:autoIdle,visible:!document.hidden,paused:!playing,reducedMotion:reduce,
   focused:!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'),hasSelection:state.hasSelection,
   manualAnimation:!['WalkFunny','Idle'].includes($('clip').value),
   activeNavigation:state.mode==='following'||state.mode==='approach_selection'
  });
  if((automatic?.clip||null)!==automaticClip){automaticClip=automatic?.clip||null;playClip();}
  // Retain stage position while performing a silent, in-place dance.
  controller.setPaused(!playing||document.hidden||Boolean(automaticClip));
  actor.style.transform=`translate3d(${state.x-stage.clientWidth/2+117}px,${state.y-10}px,0)`;
  const label=automaticClip?('Performing '+automaticClip):state.mode;
  if(label!==lastAnnounced){lastAnnounced=label;$('status').textContent=label+' · '+(selected?.id||'loading');}
 }
 last=now;requestAnimationFrame(step);
}
function selectText(){const selection=window.getSelection();if(!selection||!selection.rangeCount||selection.isCollapsed)return;const range=selection.getRangeAt(0);if(!$('source').contains(range.commonAncestorContainer))return;const selectedText=range.toString().trim();if(!selectedText||selectedText.length>500)return;const r=range.cloneRange();r.selectNodeContents($('source'));r.setEnd(range.startContainer,range.startOffset);const start=r.toString().length;activity();controller?.setSelection({validated:true,version:'audition-v1',x:30,y:20,start,end:start+selectedText.length});$('selection').textContent='Bill is curious about: '+selectedText.slice(0,130);$('clip').value='Point';viewer.setAttribute('animation-name','Point');if(typeof viewer.play==='function')viewer.play()}
document.addEventListener('mouseup',selectText);document.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow')||e.key==='Shift')selectText()});
$('submit').addEventListener('click',()=>{activity();$('response').textContent='This is a character audition; no question was sent. AI explanations will use Ask Bill source-grounded APIs.'});
$('auto-idle').addEventListener('click',()=>{
 autoIdle=!autoIdle;activity();
 $('auto-idle').setAttribute('aria-pressed',String(autoIdle));
 $('auto-idle').textContent='Automatic idle antics: '+(autoIdle?'on':'off');
 playClip();
});
$('dance-now').addEventListener('click',()=>{
 if(!director||!playing||reduce||document.hidden){
  $('response').textContent='Unpause and enable motion before starting a dance.';return;
 }
 controller?.clearSelection();activity();$('clip').value='WalkFunny';
 const act=director.auditionDance(elapsed());automaticClip=act.clip;playClip();
 $('response').textContent='Bill is trying '+act.clip+'. All dances are silent.';
});
for(const event of ['pointermove','pointerdown','keydown','touchstart','wheel','focusin']){
 document.addEventListener(event,activity,{passive:true});
}
document.addEventListener('visibilitychange',()=>{activity();playClip();});
const preference=matchMedia('(prefers-reduced-motion: reduce)');
if(preference.addEventListener)preference.addEventListener('change',e=>{
 activity();reduce=e.matches;controller?.setReducedMotion(reduce);
 $('reduce').setAttribute('aria-pressed',String(reduce));playClip();
});
$('question').addEventListener('focus',()=>controller?.setFocus(true));
$('question').addEventListener('blur',()=>controller?.setFocus(false));
viewer.addEventListener('error',()=>{$('render-error').hidden=false});setTimeout(()=>{if(!customElements.get('model-viewer'))$('render-error').hidden=false},6000);
(async()=>{try{const r=await fetch(new URL('assets/bill/characters/dist/manifest.json',scriptRoot));if(!r.ok)throw Error('Manifest not found');const d=await r.json();roster=d.characters;if(roster.length!==20)throw Error('Expected 20 characters');
const motions=await fetch(new URL('../animation-library.json',assetBase),{cache:'no-store'});
if(!motions.ok)throw Error('Motion inventory unavailable');
library=await motions.json();fillClips();
director=createIdleDirector({library,seed:121,startedAt:0});
resetController();let remembered='bill-10';try{remembered=JSON.parse(localStorage.getItem('bill-selected')||'"bill-10"')}catch{}choose(remembered);if(!selected)choose('bill-10');requestAnimationFrame(step)}catch(e){$('status').textContent='Could not load assets: '+e.message;$('render-error').hidden=false}})();
})();