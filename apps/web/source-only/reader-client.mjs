import {createReaderAnswerConsumer,consumeReaderResponse,normalizeReaderSelection,createReaderPreferences,conversationDownload,offlineSourceDownload} from '/browser/packages/ui/reader/client-core.mjs';
import {createPushToTalk} from '/browser/packages/voice/stt/push-to-talk.mjs';
import {createAudioPlaybackController} from '/browser/packages/voice/playback/controller.mjs';

const root=document.querySelector('[data-reader]');
if(root)initializeReader(root);

function initializeReader(root){
 const $=id=>document.getElementById(id),versionId=root.dataset.versionId,billId=root.dataset.billId;
 const sections=[...document.querySelectorAll('#bill-document [data-provision-id]')];
 const sources=new Map(sections.map(section=>[section.dataset.provisionId,Object.freeze({
  versionId,publication:'published',sourceComplete:true,sha256:section.dataset.sourceSha256,
  text:section.querySelector('pre.statutory-text').textContent,heading:section.querySelector('h2').textContent,element:section
 })]));
 const base='/bills/'+billId+'/versions/'+versionId;
 const sourceUrl=location.origin+base;
 let storage=null;try{storage=window.sessionStorage;}catch{}
 const preferences=createReaderPreferences({versionId,provisionIds:[...sources.keys()],storage});
 let capabilities={conversation:false,tts:false,stt:false},session=null,epoch=0,generation=0,entries=[],selectedSpan=null;
 let request=null,busy=false,tourIndex=-1,lastSourceButton=null,voiceInput=null,audioScope=null,audioRequest=null;
 let sessionRequest=null,sessionSerial=0,audioSerial=0,disposed=false,pendingSessionErase=null,eraseInProgress=false;
 let capabilityRequest=null,capabilitySerial=0;
 const sourceLookup=async provisionId=>sources.get(provisionId);
 const currentAge=()=>session?.ageBand??null;
 const setStatus=message=>{$('answer-status').textContent=message;};
 const newNode=(tag,text='',attrs={})=>{
  const element=document.createElement(tag);element.textContent=text;
  for(const [name,value]of Object.entries(attrs))element.setAttribute(name,String(value));
  return element;
 };
 const csrfHeaders=extra=>({'X-CSRF-Token':session?.csrfToken??'',...extra});
 const activeScope=()=>({versionId,conversationEpoch:epoch});
 const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
 const player=createAudioPlaybackController({
  createContext:()=>new (window.AudioContext??window.webkitAudioContext)(),
  onState:snapshot=>{
   const labels={empty:'',ready:'Audio ready. Press Play to listen.',playing:'Playing the displayed answer.',paused:'Audio paused.',completed:'Audio finished.',stopped:'Audio stopped.',disposed:''};
   $('audio-status').textContent=labels[snapshot.state]??'';
   $('audio-play').disabled=!['ready','paused','completed','stopped'].includes(snapshot.state);
   $('audio-pause').disabled=snapshot.state!=='playing';
   $('audio-mute').setAttribute('aria-pressed',String(snapshot.muted));
   $('audio-mute').textContent=snapshot.muted?'Unmute':'Mute';
  }
 });
 const isSessionUsable=()=>session&&Date.parse(session.expiresAt)>Date.now();
 const clientError=response=>response.status===429?'Question capacity is temporarily full. Please try again shortly.':
  [401,403].includes(response.status)?'Your question session has expired or changed. Clear the session and start again.':
  response.status===409?'This conversation changed. Start a new question to continue.':
  'The answer service is unavailable right now. You can still read, search, and share the original source.';

 function applyPreferences(){
  const state=preferences.snapshot();root.dataset.textSize=state.textSize;
  $('text-size').value=state.textSize;$('reading-level').value=state.readingLevel;
  $('bookmark-count').textContent='('+state.bookmarks.length+')';
  $('bookmarks-empty').hidden=state.bookmarks.length>0;
  $('bookmarks-list').replaceChildren(...state.bookmarks.map(id=>{
   const li=newNode('li'),link=newNode('a',sources.get(id).heading,{href:'#provision-'+id});
   li.append(link);return li;
  }));
  for(const button of document.querySelectorAll('[data-bookmark]')){
   const active=state.bookmarks.includes(button.dataset.bookmark);
   button.setAttribute('aria-pressed',String(active));button.textContent=active?'Bookmarked':'Bookmark';
  }
 }
 function selectionContext(){
  $('selection-context').hidden=selectedSpan===null;
  $('selection-quote').textContent=selectedSpan?.quote??'';
 }
 function focusSection(id){
  const element=sources.get(id)?.element;if(!element)return;
  element.focus({preventScroll:true});element.scrollIntoView({behavior:motion(),block:'start'});
 }
 function stopAudio(){
  audioSerial++;audioRequest?.abort();audioRequest=null;audioScope=null;
  player.stop();player.invalidate({versionId,conversationEpoch:epoch+1});
  $('audio-controls').hidden=true;$('cancel-audio-request').hidden=true;
 }
 function cancelActive({announce=false}={}){
  generation++;request?.abort();request=null;busy=false;
  voiceInput?.cancel();stopAudio();
  const last=entries.at(-1);
  if(last?.status==='answering')last.status='stopped';
  updateQuestionState();renderHistory();
  if(announce)setStatus('Answer stopped. Any already verified source passages remain available.');
 }
 function updateQuestionState(){
  $('ask-submit').disabled=busy||!isSessionUsable()||!capabilities.conversation;
  $('cancel-answer').hidden=!busy;
  $('start-session').disabled=!capabilities.conversation||sessionRequest!==null||eraseInProgress;
  $('record-question').disabled=!voiceInput||!isSessionUsable()||busy||currentAge()!=='adult';
 }
 function openSource(card,button){
  const source=sources.get(card.provisionId);if(!source||card.versionId!==versionId)return;
  lastSourceButton=button;
  $('source-drawer-title').textContent=card.citationLabel;
  $('source-drawer-version').textContent='Exact wording · Version '+versionId;
  $('source-drawer-quote').textContent=card.quote;
  $('source-drawer-hash').textContent='Quote SHA-256: '+card.quoteHash;
  $('source-drawer-link').href='#provision-'+card.provisionId;
  const dialog=$('source-drawer');
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  $('close-source').focus();
 }
 function closeSource({returnFocus=true}={}){
  const dialog=$('source-drawer');if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
  if(returnFocus&&lastSourceButton?.isConnected)lastSourceButton.focus({preventScroll:true});
 }
 function renderHistory(){
  const log=$('conversation-log');
  if(!entries.length){log.replaceChildren(newNode('p','What would you like to understand?',{id:'conversation-empty'}));}
  else log.replaceChildren(...entries.map((entry,index)=>{
   const article=newNode('article','',{class:'conversation-entry','aria-label':'Question '+(index+1)});
   article.append(newNode('p','YOU',{class:'speaker-label'}),newNode('p',entry.question,{class:'user-question'}));
   if(!entry.segments.length&&entry.status==='answering')article.append(newNode('p','Finding and checking the source…',{class:'control-hint'}));
   for(const segment of entry.segments){
    const part=newNode('section','',{class:'answer-segment','aria-label':segment.label??'Source-grounded answer'});
    part.append(newNode('p',segment.label??'Source-grounded response',{class:'answer-label'}),newNode('p',segment.text,{class:'answer-text'}));
    const qualifications=[...new Set([...(segment.qualifications??[]),...segment.claims.flatMap(claim=>claim.qualifications)])];
    if(qualifications.length){const list=newNode('ul','',{class:'qualifications'});for(const text of qualifications)list.append(newNode('li',text));part.append(list);}
    const cards=newNode('div','',{class:'citation-list'});
    for(const card of segment.citations){
     const button=newNode('button','Source: '+card.citationLabel,{type:'button',class:'citation-button','aria-haspopup':'dialog'});
     button.addEventListener('click',()=>openSource(card,button));cards.append(button);
    }
    part.append(cards);
    if(capabilities.tts){
     const speak=newNode('button','Listen to this answer',{type:'button',class:'quiet-button'});
     speak.disabled=busy||entry.epoch!==epoch||entry.status!=='completed';
     speak.addEventListener('click',()=>prepareAudio(entry,segment,speak));part.append(speak);
    }
    article.append(part);
   }
   const messages={stopped:'Stopped by you.',failed:'The answer could not be completed. Verified source cards above remain available.',completed:entry.segments.length?'Answer complete.':'No supported answer was available from this source.'};
   if(messages[entry.status])article.append(newNode('p',messages[entry.status],{class:'entry-status'}));
   if(entry.status==='failed'){
    const retry=newNode('button','Try this question again',{type:'button',class:'quiet-button'});
    retry.addEventListener('click',()=>{$('question').value=entry.question;selectedSpan=entry.selectedSpan;selectionContext();$('question').focus();});article.append(retry);
   }
   return article;
  }));
  $('export-conversation').disabled=entries.length===0;
 }
 async function startSession(event){
  event.preventDefault();if(sessionRequest||eraseInProgress)return;
  const ageBand=$('age-band').value;
  if(!['adult','13-17','under-13'].includes(ageBand))return;
  $('child-session').hidden=ageBand!=='under-13';
  if(ageBand==='under-13'){$('capability-status').textContent='The learning room is ready for younger readers.';return;}
  if(!capabilities.conversation)return;
  const ticket=++sessionSerial,abort=new AbortController();sessionRequest=abort;updateQuestionState();
  const timeout=setTimeout(()=>abort.abort(),15000);
  try{
   const response=await fetch('/api/session',{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({ageBand}),signal:abort.signal});
   if(!response.ok)throw new Error(clientError(response));
   const body=await boundedJson(response,12000);
   if(ticket!==sessionSerial)return;
   if(typeof body.csrfToken!=='string'||body.csrfToken.length<16||body.csrfToken.length>512||
     body.ageBand!==ageBand||!Number.isFinite(Date.parse(body.expiresAt))||Date.parse(body.expiresAt)<=Date.now()||
     !Number.isSafeInteger(body.conversationEpoch)||body.conversationEpoch<0)throw new Error('The question session could not be verified. Please try again.');
   session=Object.freeze(body);epoch=body.conversationEpoch;pendingSessionErase=null;$('erase-retry').hidden=true;
   $('session-form').hidden=true;$('session-controls').hidden=false;
   $('session-label').textContent=ageBand==='adult'?'Adult session · this tab':'Teen session · this tab';
   setStatus('Session ready. Type a question or choose a passage.');
   setupVoice();selectionContext();$('question').focus();
  }catch(error){if(ticket===sessionSerial&&!disposed)$('capability-status').textContent=abort.signal.aborted?'The session request timed out. Please try again.':error.message||'A question session could not be started. The source remains readable.';}
  finally{clearTimeout(timeout);if(ticket===sessionSerial)sessionRequest=null;updateQuestionState();}
 }
 async function eraseSession({clearPreferences=false}={}){
  if(eraseInProgress)return;
  const prior=session??pendingSessionErase;sessionSerial++;sessionRequest?.abort();sessionRequest=null;
  cancelActive();session=null;voiceInput?.dispose();voiceInput=null;entries=[];selectedSpan=null;
  $('question').value='';$('review-transcript').value='';$('transcript-review').hidden=true;
  $('session-controls').hidden=true;$('session-form').hidden=false;$('child-session').hidden=true;
  $('age-band').value='';selectionContext();renderHistory();
  if(clearPreferences){preferences.clear();applyPreferences();}
  updateQuestionState();$('age-band').focus();
  $('capability-status').textContent='History cleared from this page. Start a new session when you are ready.';
  if(prior){
   eraseInProgress=true;updateQuestionState();const abort=new AbortController();
   const timer=setTimeout(()=>abort.abort(),10000);
   try{const response=await fetch('/api/session',{method:'DELETE',credentials:'same-origin',cache:'no-store',
    headers:{'X-CSRF-Token':prior.csrfToken},signal:abort.signal});
    if(!response.ok&&!([401,404].includes(response.status)))throw new Error('SESSION_DELETE_FAILED');
    pendingSessionErase=null;$('erase-retry').hidden=true;
   }catch{pendingSessionErase=prior;$('erase-retry').hidden=false;$('capability-status').textContent='History was cleared from this page. Retry clearing the server session when connected; otherwise it expires automatically.';}
   finally{clearTimeout(timer);eraseInProgress=false;updateQuestionState();}
  }
 }
 async function askQuestion(event){
  event.preventDefault();
  if(!isSessionUsable()||!capabilities.conversation){setStatus('Start a new question session before asking.');return;}
  const question=$('question').value.trim();
  if(question.length<3||question.length>2000){setStatus('Use 3–2,000 characters for your question.');$('question').focus();return;}
  cancelActive();epoch++;voiceInput?.invalidate(activeScope());
  const token=++generation,requestEpoch=epoch,csrf=session.csrfToken,abort=new AbortController();request=abort;busy=true;
  const entry={question,segments:[],status:'answering',answerId:null,epoch:requestEpoch,selectedSpan};
  entries.push(entry);if(entries.length>20)entries.shift();renderHistory();updateQuestionState();
  setStatus('Finding and checking source passages…');
  const deadline=setTimeout(()=>abort.abort(),60000);
  const current=()=>generation===token&&session?.csrfToken===csrf&&!abort.signal.aborted;
  const consumer=createReaderAnswerConsumer({versionId,epoch:requestEpoch,sourceLookup,isCurrent:current,onUpdate:update=>{
   entry.answerId=update.answerId;entry.segments=[...update.segments];
   if(update.type==='answer.completed')entry.status='completed';
   else if(update.type==='answer.cancelled')entry.status='stopped';
   else if(update.type==='answer.failed')entry.status='failed';
   renderHistory();
   if(update.type==='segment.validated'||update.type==='correction')setStatus(update.type==='correction'?'An earlier passage was corrected. Check the updated source cards.':'A checked passage is ready. You can inspect its source.');
   if(update.finished)setStatus(entry.status==='completed'?(entry.segments.length?'Answer complete. Open a source card to check the exact wording.':'No supported answer was available. Try a more specific question or select a passage.'):entry.status==='stopped'?'Answer stopped.':'The answer service could not complete this response. You can still read its verified source cards.');
  }});
  try{
   const response=await fetch('/api/conversation',{method:'POST',credentials:'same-origin',cache:'no-store',signal:abort.signal,
    headers:csrfHeaders({'Content-Type':'application/json','Accept':'text/event-stream, application/json'}),
    body:JSON.stringify({billId,versionId,question,readingLevel:preferences.snapshot().readingLevel,
     conversationEpoch:requestEpoch,...(selectedSpan?{selectedSpan}:{})})});
   if(!response.ok)throw new Error(clientError(response));
   await consumeReaderResponse(response,{consumer,signal:abort.signal});
  }catch(error){
   if(generation!==token||session?.csrfToken!==csrf)return;
   entry.status=abort.signal.aborted?'stopped':'failed';
   setStatus(abort.signal.aborted?'The answer timed out. You can try again or read the original source.':
    error.name==='ReaderClientError'?'This response could not be matched safely to the displayed source. It was stopped; try again or read the original wording.':error.message||'The answer service is unavailable. The original source remains readable.');
  }finally{
   clearTimeout(deadline);
   if(generation===token){busy=false;request=null;updateQuestionState();renderHistory();}
  }
 }
 function setupVoice(){
  voiceInput?.dispose();voiceInput=null;
  const recorderAvailable=typeof window.MediaRecorder==='function'&&typeof navigator.mediaDevices?.getUserMedia==='function';
  const audioAvailable=typeof (window.AudioContext??window.webkitAudioContext)==='function';
  $('voice-availability').textContent=[capabilities.tts&&audioAvailable?'Answer audio is available. Choose Listen on a completed answer.':'Answer audio is currently unavailable.',
   capabilities.stt&&currentAge()==='adult'&&recorderAvailable?'Microphone input is optional. Stop and explicitly transcribe the recording, then review it before asking.':currentAge()==='13-17'?'Use the question box to type your question. Microphone input is unavailable for this session.':'Microphone input is unavailable; typed questions still work.'].join(' ');
  if(capabilities.stt&&currentAge()==='adult'&&recorderAvailable){
   voiceInput=createPushToTalk({mediaDevices:navigator.mediaDevices,
    createRecorder:(stream,mimeType)=>new MediaRecorder(stream,{mimeType}),
    providerPolicy:{enabled:true,retention:'verified-minimal'},
    transcriber:{async transcribe({audio,mimeType,versionId:version,conversationEpoch,signal}){
     const response=await fetch('/api/transcription',{method:'POST',credentials:'same-origin',cache:'no-store',signal,
      headers:csrfHeaders({'Content-Type':mimeType,'X-Bill-Id':billId,'X-Version-Id':version,'X-Conversation-Epoch':String(conversationEpoch)}),
      body:new Blob(audio,{type:mimeType})});
     if(!response.ok)throw new Error('TRANSCRIPTION_UNAVAILABLE');
     const value=await boundedJson(response,16000);
     if(value.editable!==true)throw new Error('TRANSCRIPTION_UNAVAILABLE');
     return {text:value.text,language:['en','en-US','es','es-ES'].includes(value.language)?value.language:'en'};
    }},onStatus:snapshot=>{
     const labels={idle:'',requesting:'Waiting for microphone permission…',recording:'Recording. Stop when you finish; the limit is 30 seconds.',stopping:'Stopping the recording…',recorded:'Recording is ready. Choose Transcribe recording to send it for speech recognition.',transcribing:'Transcribing your recording…',reviewing:'Review the transcript. You can edit every word before using it.',denied:'Microphone permission was not granted. You can type your question.',failed:'Recording or transcription failed. You can try again or type your question.',cancelled:'Recording discarded.',submitted:'Transcript copied into the question box. Review it and choose Ask Bill when ready.',disposed:''};
     $('microphone-status').textContent=labels[snapshot.state]??'';
     $('record-question').hidden=['requesting','recording','stopping','recorded','transcribing','reviewing'].includes(snapshot.state);
     $('stop-recording').hidden=snapshot.state!=='recording';
     $('transcribe-recording').hidden=snapshot.state!=='recorded';
     $('cancel-recording').hidden=!['requesting','recording','stopping','recorded','transcribing','reviewing'].includes(snapshot.state);
     $('transcript-review').hidden=snapshot.state!=='reviewing';
     if(snapshot.state!=='reviewing')$('review-transcript').value='';
    }});
  }
  updateQuestionState();
 }
 async function prepareAudio(entry,segment,button){
  if(!isSessionUsable()||busy||entry.epoch!==epoch||!capabilities.tts)return;
  stopAudio();const token=++audioSerial,abort=new AbortController(),csrf=session.csrfToken;audioRequest=abort;
  button.disabled=true;$('cancel-audio-request').hidden=false;setStatus('Preparing audio for the displayed answer…');
  const timeout=setTimeout(()=>abort.abort(),45000);
  let context=null;
  try{
   const response=await fetch('/api/speech',{method:'POST',credentials:'same-origin',cache:'no-store',signal:abort.signal,
    headers:csrfHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({billId,versionId,answerId:entry.answerId,segmentId:segment.id,conversationEpoch:entry.epoch})});
   if(!response.ok)throw new Error('AUDIO_UNAVAILABLE');
   if(response.headers.get('x-source-validated')!=='true'||response.headers.get('x-voice-licensed')!=='true'||
     !/^audio\/(wav|wave|x-wav)(?:;|$)/i.test(response.headers.get('content-type')??''))throw new Error('UNVERIFIED_AUDIO');
   const bytes=await boundedBytes(response,12000000,abort.signal);
   const textSha256=await sha256(new TextEncoder().encode(segment.text)),audioSha256=await sha256(bytes);
   if(response.headers.get('x-text-sha256')!==textSha256||response.headers.get('x-audio-sha256')!==audioSha256)throw new Error('UNVERIFIED_AUDIO');
   context=new (window.AudioContext??window.webkitAudioContext)();
   const buffer=await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
   if(token!==audioSerial||abort.signal.aborted||csrf!==session?.csrfToken||entry.epoch!==epoch)return;
   player.load({audioBuffer:buffer,metadata:{versionId,segmentId:segment.id,conversationEpoch:entry.epoch,
    textSha256,audioSha256,durationSeconds:buffer.duration,sourceValidated:true,voiceLicensed:true}});
   audioScope={versionId,conversationEpoch:entry.epoch};
   $('audio-caption').textContent=segment.text;$('audio-controls').hidden=false;
   $('audio-controls').closest('details').open=true;$('audio-play').focus();
   setStatus('Audio is ready. Press Play to listen. The complete text and sources remain visible.');
  }catch{
   if(token===audioSerial)setStatus(abort.signal.aborted?'The audio request timed out. You can try again or read the displayed answer.':'Audio could not be prepared. The answer and its source cards remain available to read.');
  }finally{
   clearTimeout(timeout);
   if(context)try{await context.close();}catch{}
   if(token===audioSerial){audioRequest=null;$('cancel-audio-request').hidden=true;button.disabled=busy||entry.epoch!==epoch;}
  }
 }
 async function refreshCapabilities(){
  capabilityRequest?.abort();const ticket=++capabilitySerial,abort=new AbortController();capabilityRequest=abort;
  $('refresh-capabilities').disabled=true;$('capability-status').textContent='Checking question availability…';
  const timeout=setTimeout(()=>abort.abort(),10000);
  try{
   const response=await fetch('/api/capabilities',{credentials:'same-origin',cache:'no-store',signal:abort.signal});
   if(!response.ok)throw new Error('UNAVAILABLE');const value=await boundedJson(response,12000);
   if(ticket!==capabilitySerial||disposed)return;
   if(['conversation','tts','stt'].some(key=>typeof value[key]!=='boolean'))throw new Error('INVALID_CAPABILITIES');
   capabilities={conversation:value.conversation,tts:value.tts,stt:value.stt};
   $('capability-status').textContent=value.conversation?(['source','source-only'].includes(value.mode)?'Ask about the original wording. Live AI explanations are currently off.':'Source-grounded questions are available.'):'Live questions are currently unavailable. Read, search, share, or take the guided source tour.';
   $('refresh-capabilities').hidden=value.conversation;
   if(session)setupVoice();updateQuestionState();
  }catch{
   if(ticket!==capabilitySerial||disposed)return;
   capabilities={conversation:false,tts:false,stt:false};
   $('capability-status').textContent='Question availability could not be checked. Try again, or read, search, share, and take the guided source tour.';
   $('refresh-capabilities').hidden=false;updateQuestionState();
  }finally{clearTimeout(timeout);if(ticket===capabilitySerial){capabilityRequest=null;$('refresh-capabilities').disabled=false;}}
 }
 function showTour(index){
  const count=Math.min(sections.length,12);if(index<0||index>=count){endTour();return;}
  tourIndex=index;const section=sections[index];
  $('tour-controls').hidden=false;
  $('tour-progress').textContent='Step '+(index+1)+' of '+count+': '+section.querySelector('h2').textContent+'. Read the original wording below.'+(sections.length>count?' This introduction covers part of the document.':'');
  $('tour-previous').disabled=index===0;$('tour-next').textContent=index===count-1?'Finish tour':'Next passage';
  for(const item of sections)item.classList.toggle('is-tour-target',item===section);
  focusSection(section.dataset.provisionId);
 }
 function endTour(){tourIndex=-1;$('tour-controls').hidden=true;for(const section of sections)section.classList.remove('is-tour-target');}

 for(const element of document.querySelectorAll('[data-enhanced]'))element.hidden=false;
 applyPreferences();selectionContext();updateQuestionState();
 $('session-form').addEventListener('submit',startSession);
 $('refresh-capabilities').addEventListener('click',refreshCapabilities);
 $('question-form').addEventListener('submit',askQuestion);
 $('cancel-answer').addEventListener('click',()=>cancelActive({announce:true}));
 $('clear-history').addEventListener('click',()=>eraseSession());
 $('clear-session').addEventListener('click',()=>eraseSession({clearPreferences:true}));
 $('retry-clear-session').addEventListener('click',()=>eraseSession());
 $('clear-selection').addEventListener('click',()=>{selectedSpan=null;selectionContext();});
 $('reading-level').addEventListener('change',event=>preferences.setReadingLevel(event.target.value));
 $('text-size').addEventListener('change',event=>{preferences.setTextSize(event.target.value);applyPreferences();});
 $('question').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('question-form').requestSubmit();}});
 for(const button of document.querySelectorAll('[data-bookmark]'))button.addEventListener('click',()=>{preferences.toggleBookmark(button.dataset.bookmark);applyPreferences();});
 for(const button of document.querySelectorAll('[data-example]'))button.addEventListener('click',()=>{$('question').value=button.dataset.example;selectedSpan=null;selectionContext();$('question').focus();});
 for(const button of document.querySelectorAll('[data-ask-section]'))button.addEventListener('click',()=>{
  const id=button.dataset.askSection,source=sources.get(id),quote=Array.from(source.text).slice(0,4000).join('');
  selectedSpan=normalizeReaderSelection({provisionId:id,text:source.text,startUTF16:0,endUTF16:quote.length,selectedText:quote});
  selectionContext();$('question').value='Please explain '+source.heading+' and its exceptions.';
  if(!session)$('age-band').focus();else $('question').focus();
  $('conversation-panel').scrollIntoView({behavior:motion(),block:'start'});
 });
 document.addEventListener('selectionchange',()=>{
  const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)return;
  const range=selection.getRangeAt(0),start=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
  const pre=start?.closest?.('#bill-document pre.statutory-text');
  if(!pre||!pre.contains(range.endContainer))return;
  try{
   const before=range.cloneRange();before.selectNodeContents(pre);before.setEnd(range.startContainer,range.startOffset);
   const through=range.cloneRange();through.selectNodeContents(pre);through.setEnd(range.endContainer,range.endOffset);
   selectedSpan=normalizeReaderSelection({provisionId:pre.closest('[data-provision-id]').dataset.provisionId,text:pre.textContent,
    startUTF16:before.toString().length,endUTF16:through.toString().length,selectedText:range.toString()});
   selectionContext();
  }catch{/* multi-section and partial-Unicode selections never become citations */}
 });
 $('close-source').addEventListener('click',()=>closeSource());
 $('source-drawer').addEventListener('cancel',()=>{if(lastSourceButton?.isConnected)lastSourceButton.focus({preventScroll:true});});
 $('source-drawer-link').addEventListener('click',()=>{const id=$('source-drawer-link').hash.slice('#provision-'.length);closeSource({returnFocus:false});focusSection(id);});
 document.querySelector('[data-tour-start]').addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();showTour(0);});
 $('tour-previous').addEventListener('click',()=>showTour(tourIndex-1));
 $('tour-next').addEventListener('click',()=>showTour(tourIndex+1));
 $('tour-end').addEventListener('click',()=>{endTour();document.querySelector('[data-tour-start]').focus();});
 $('export-conversation').addEventListener('click',()=>{
  try{
   const text=conversationDownload({title:document.querySelector('h1').textContent,versionId,sourceUrl,entries});
   const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
   const link=newNode('a','',{href:url,download:'ask-bill-conversation-'+versionId.slice(0,8)+'.txt'});
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setStatus('Conversation download prepared. It includes your questions and the displayed source cards.');
  }catch{setStatus('This conversation could not be exported. You can still select and copy the displayed text.');}
 });
 $('download-offline').addEventListener('click',async()=>{
  $('download-offline').disabled=true;
  try{
   const html=await offlineSourceDownload({title:document.querySelector('h1').textContent,versionId,billId,sourceUrl,
    sourceStatus:root.dataset.sourceStatus,canonicalSha256:root.dataset.sourceSha256,
    provisions:[...sources].map(([id,source])=>({id,heading:source.heading,text:source.text,sha256:source.sha256}))});
   const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
   const link=newNode('a','',{href:url,download:'ask-bill-offline-'+versionId.slice(0,8)+'.html'});
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   $('offline-status').textContent='Offline reader prepared. Open the saved HTML file to read every provision without a connection. It is a snapshot; use its source links to check for changes when online.';
  }catch{$('offline-status').textContent='This offline copy could not be verified. Use Download complete text, or try again after reloading the source.';}
  finally{$('download-offline').disabled=false;}
 });
 $('share-version').addEventListener('click',async()=>{
  const url=sourceUrl+(selectedSpan?'#provision-'+selectedSpan.provisionId:'');
  try{await navigator.clipboard.writeText(url);setStatus('Source link copied. It contains no questions or conversation.');}
  catch{setStatus('Copy this source link: '+url);}
 });
 $('record-question').addEventListener('click',async()=>{
  if(!voiceInput||!isSessionUsable()||busy)return;stopAudio();
  const mimeType=['audio/webm','audio/ogg','audio/mp4'].find(mime=>MediaRecorder.isTypeSupported(mime));
  if(!mimeType){$('microphone-status').textContent='This browser cannot record a supported audio format. You can type instead.';return;}
  try{await voiceInput.begin({userGesture:true,ageBand:'adult',...activeScope(),mimeType});}
  catch{if(!['denied','cancelled'].includes(voiceInput?.snapshot().state))$('microphone-status').textContent='The microphone could not start. You can type your question.';}
 });
 $('stop-recording').addEventListener('click',()=>{try{voiceInput?.stopRecording(activeScope());}catch{$('microphone-status').textContent='The recording could not be stopped cleanly. Discard it and try again.';}});
 $('cancel-recording').addEventListener('click',()=>voiceInput?.cancel());
 $('transcribe-recording').addEventListener('click',async()=>{
  const input=voiceInput;if(!input)return;
  try{const reply=await input.transcribe({userGesture:true,...activeScope()});if(input===voiceInput){$('review-transcript').value=reply.text;$('review-transcript').focus();}}
  catch{/* input state reports a safe error without exposing provider details */}
 });
 $('use-transcript').addEventListener('click',()=>{
  try{if($('review-transcript').value.trim().length<3||$('review-transcript').value.trim().length>2000)throw new Error('TRANSCRIPT_TOO_LONG');voiceInput.editTranscript($('review-transcript').value.trim());const reply=voiceInput.submitText({userGesture:true,...activeScope()});$('question').value=reply.text;$('question').focus();}
  catch{$('microphone-status').textContent='Edit the transcript to 3–2,000 characters before using it as a question.';}
 });
 $('audio-play').addEventListener('click',async()=>{if(!audioScope)return;try{await player.play({userGesture:true,...audioScope});}catch{$('audio-status').textContent='Playback could not start. The displayed transcript is still available.';}});
 $('audio-pause').addEventListener('click',()=>player.pause());
 $('audio-stop').addEventListener('click',()=>player.stop());
 $('cancel-audio-request').addEventListener('click',()=>{stopAudio();renderHistory();setStatus('Audio request cancelled. The displayed answer is still available.');});
 $('audio-mute').addEventListener('click',()=>player.setMuted(!player.getSnapshot().muted));
 $('audio-rate').addEventListener('change',event=>player.setRate(Number(event.target.value)));
 document.addEventListener('visibilitychange',()=>{if(disposed)return;player.visibilityChanged(document.hidden);if(document.hidden&&voiceInput?.snapshot().recording)voiceInput.cancel();});
 window.addEventListener('pagehide',()=>{disposed=true;cancelActive();sessionSerial++;sessionRequest?.abort();capabilitySerial++;capabilityRequest?.abort();voiceInput?.dispose();player.dispose();session=null;entries=[];},{once:true});
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 refreshCapabilities();
}

async function boundedBytes(response,maxBytes,signal){
 if(!response.body?.getReader)throw new Error('BODY_UNAVAILABLE');
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{while(true){if(signal?.aborted)throw new Error('CANCELLED');const {done,value}=await reader.read();if(done)break;
  length+=value.byteLength;if(length>maxBytes)throw new Error('BODY_TOO_LARGE');chunks.push(value);}
 }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
 const result=new Uint8Array(length);let position=0;for(const chunk of chunks){result.set(chunk,position);position+=chunk.length;}return result;
}
async function boundedJson(response,maxBytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBytes(response,maxBytes)));}
async function sha256(bytes){const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');}
