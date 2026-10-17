/** Browser-safe reader state. Serve only these imports through an explicit file allowlist. */
import {answerView} from '../citations/index.mjs';
import {parseAnswerEvent} from '../../contracts/dist/index.js';

export class ReaderClientError extends Error{
 constructor(code){super(code);this.name='ReaderClientError';this.code=code;}
}
const deny=code=>{throw new ReaderClientError(code);};
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value);
const terminal=new Set(['answer.completed','answer.failed','answer.cancelled']);

/** Convert DOM UTF-16 offsets once; all source APIs and quotes use Unicode code points. */
export function normalizeReaderSelection({provisionId,text,startUTF16,endUTF16,selectedText}={}){
 if(!id(provisionId)||typeof text!=='string'||!Number.isSafeInteger(startUTF16)||!Number.isSafeInteger(endUTF16)||
   startUTF16<0||endUTF16<=startUTF16||endUTF16>text.length||typeof selectedText!=='string'||
   text.slice(startUTF16,endUTF16)!==selectedText||Array.from(selectedText).length>4000||
   Array.from(selectedText).some(char=>char.length===1&&/[\ud800-\udfff]/u.test(char)))deny('INVALID_SELECTED_PASSAGE');
 return Object.freeze({provisionId,start:Array.from(text.slice(0,startUTF16)).length,
  end:Array.from(text.slice(0,endUTF16)).length,quote:selectedText});
}

/** Revalidate each prefix with the canonical citation presenter before any UI change. */
export function createReaderAnswerConsumer({versionId,epoch,sourceLookup,isCurrent=()=>true,onUpdate=()=>{}}={}){
 if(!id(versionId)||!Number.isSafeInteger(epoch)||epoch<0||typeof sourceLookup!=='function'||
   typeof isCurrent!=='function'||typeof onUpdate!=='function')deny('INVALID_READER_CONTEXT');
 const events=[],active=new Map();let answerId=null,finished=false;
 return Object.freeze({
  async accept(raw){
   if(!isCurrent())deny('STALE_ANSWER');
   if(finished||events.length>=101)deny('ANSWER_STREAM_FINISHED');
   let event;try{event=parseAnswerEvent(raw);}catch{deny('INVALID_ANSWER_EVENT');}
   if(event.documentVersion!==versionId||event.conversationEpoch!==epoch||event.sequence!==events.length||
     (answerId!==null&&event.answerId!==answerId)||(!events.length&&event.type!=='answer.started'))deny('ANSWER_SCOPE_MISMATCH');
   const next=[...events,event];
   let verified;try{verified=await answerView({events:next,versionId,answerId:event.answerId,epoch,sourceLookup,allowModelReviewed:true});}
   catch{deny('SOURCE_VALIDATION_FAILED');}
   // Source digest verification is asynchronous. Cancellation during it must win.
   if(!isCurrent())deny('STALE_ANSWER');
   if(event.type==='correction')active.delete(event.replacesSegmentId);
   if(event.type==='segment.validated'||event.type==='correction'){
    const result=verified.find(segment=>segment.id===event.segment.id);
    if(!result)deny('SOURCE_VALIDATION_FAILED');
    active.set(result.id,Object.freeze({...result,
     claims:Object.freeze(event.segment.claims.map(claim=>Object.freeze({kind:claim.kind,support:claim.support,
      qualifications:Object.freeze([...claim.qualifications]),...(claim.attribution?{attribution:claim.attribution}:{})})))}));
   }
   answerId=event.answerId;events.push(event);finished=terminal.has(event.type);
   const update=Object.freeze({type:event.type,answerId,epoch,versionId,
    segments:Object.freeze([...active.values()]),finished,
    ...(event.type==='answer.failed'?{errorCode:event.code}:{})});
   onUpdate(update);return update;
  },
  finish(){if(!finished)deny('INCOMPLETE_ANSWER_STREAM');},
  snapshot(){return Object.freeze({answerId,finished,eventCount:events.length,segments:Object.freeze([...active.values()])});}
 });
}

async function readBody(response,{maxBytes,signal,onChunk}){
 if(!response?.body?.getReader)deny('STREAM_UNAVAILABLE');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let received=0;
 try{
  while(true){
   if(signal?.aborted)deny('ANSWER_CANCELLED');
   const {done,value}=await reader.read();if(done)break;
   if(signal?.aborted)deny('ANSWER_CANCELLED');
   received+=value.byteLength;if(received>maxBytes)deny('ANSWER_TOO_LARGE');
   await onChunk(decoder.decode(value,{stream:true}));
  }
  await onChunk(decoder.decode());
 }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}

/** POST SSE supports bounded, complete events and a JSON whole-answer fallback. */
export async function consumeReaderResponse(response,{consumer,signal,maxBytes=1000000}={}){
 if(!response?.ok||typeof consumer?.accept!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1000||maxBytes>2000000)deny('ANSWER_UNAVAILABLE');
 const contentType=(response.headers?.get('content-type')??'').toLowerCase();
 if(contentType.startsWith('application/json')){
  let body='';await readBody(response,{maxBytes,signal,onChunk:chunk=>{body+=chunk;}});
  let parsed;try{parsed=JSON.parse(body);}catch{deny('INVALID_ANSWER_JSON');}
  if(!parsed||!Array.isArray(parsed.events)||parsed.events.length<1||parsed.events.length>101)deny('INVALID_ANSWER_JSON');
  for(const event of parsed.events){if(signal?.aborted)deny('ANSWER_CANCELLED');await consumer.accept(event);}
 }else if(contentType.startsWith('text/event-stream')){
  let buffer='';
  const dispatch=async frame=>{
   if(!frame.trim())return;
   const lines=frame.split('\n'),data=[];let type=null,eventId=null;
   for(const raw of lines){
    const line=raw.endsWith('\r')?raw.slice(0,-1):raw;
    if(!line||line.startsWith(':'))continue;
    const split=line.indexOf(':'),name=split<0?line:line.slice(0,split);
    const value=(split<0?'':line.slice(split+1)).replace(/^ /,'');
    if(name==='data')data.push(value);
    else if(name==='event'){if(type!==null)deny('INVALID_EVENT_FRAME');type=value;}
    else if(name==='id'){if(eventId!==null)deny('INVALID_EVENT_FRAME');eventId=value;}
    else if(name!=='retry')deny('INVALID_EVENT_FRAME');
   }
   if(!data.length)return;
   let event;try{event=JSON.parse(data.join('\n'));}catch{deny('INVALID_EVENT_FRAME');}
   if((type!==null&&type!==event.type)||(eventId!==null&&eventId!==String(event.sequence)))deny('INVALID_EVENT_FRAME');
   await consumer.accept(event);
  };
  await readBody(response,{maxBytes,signal,onChunk:async chunk=>{
   buffer+=chunk;
   if(buffer.length>250000)deny('EVENT_TOO_LARGE');
   let boundary;
   while((boundary=/\r?\n\r?\n/.exec(buffer))!==null){
    const frame=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);
    await dispatch(frame);
   }
  }});
  // An incomplete trailing frame is not treated as a successful final response.
  if(buffer.trim())deny('INCOMPLETE_EVENT_FRAME');
 }else deny('UNSUPPORTED_ANSWER_RESPONSE');
 consumer.finish();return consumer.snapshot();
}

const levels=new Set(['standard','simple','concise']),sizes=new Set(['standard','large','largest']);
/** Only non-sensitive preferences and validated provision IDs are written to sessionStorage. */
export function createReaderPreferences({versionId,provisionIds,storage=null}={}){
 if(!id(versionId)||!Array.isArray(provisionIds)||!provisionIds.length||provisionIds.some(value=>!id(value)))deny('INVALID_PREFERENCE_CONTEXT');
 const allowed=new Set(provisionIds),key='ask-bill.reader.v1.'+versionId;
 let state={readingLevel:'standard',textSize:'standard',bookmarks:[]};
 try{
  const raw=storage?.getItem(key);
  if(typeof raw==='string'&&raw.length<=20000){
   const parsed=JSON.parse(raw);
   if(parsed&&levels.has(parsed.readingLevel)&&sizes.has(parsed.textSize)&&Array.isArray(parsed.bookmarks)&&
     parsed.bookmarks.length<=500&&parsed.bookmarks.every(value=>allowed.has(value)))
     state={readingLevel:parsed.readingLevel,textSize:parsed.textSize,bookmarks:[...new Set(parsed.bookmarks)]};
  }
 }catch{/* storage may be unavailable, disabled or stale */}
 const snapshot=()=>Object.freeze({...state,bookmarks:Object.freeze([...state.bookmarks])});
 const persist=()=>{try{storage?.setItem(key,JSON.stringify(state));}catch{}return snapshot();};
 return Object.freeze({
  snapshot,
  setReadingLevel(value){if(!levels.has(value))deny('INVALID_READING_LEVEL');state.readingLevel=value;return persist();},
  setTextSize(value){if(!sizes.has(value))deny('INVALID_TEXT_SIZE');state.textSize=value;return persist();},
  toggleBookmark(value){if(!allowed.has(value))deny('UNKNOWN_PROVISION');state.bookmarks=state.bookmarks.includes(value)?state.bookmarks.filter(x=>x!==value):[...state.bookmarks,value];return persist();},
  clear(){state={readingLevel:'standard',textSize:'standard',bookmarks:[]};try{storage?.removeItem(key);}catch{}return snapshot();}
 });
}

export function conversationDownload({title,versionId,sourceUrl,entries}={}){
 if(typeof title!=='string'||title.length>300||!id(versionId)||typeof sourceUrl!=='string'||sourceUrl.length>2048||
   !Array.isArray(entries)||entries.length>20)deny('INVALID_EXPORT');
 const lines=['Ask Bill — conversation download',title,'Source version: '+versionId,'Source: '+sourceUrl,
  'This download includes the questions you chose to export. Keep it private if it contains personal information.',
  'Document explanations are not legal advice or confirmation of current law.'];
 for(const entry of entries){
  if(typeof entry.question!=='string'||entry.question.length>4000||!Array.isArray(entry.segments)||entry.segments.length>100)deny('INVALID_EXPORT');
  lines.push('','Question: '+entry.question,'Response status: '+String(entry.status??'unknown'));
  for(const segment of entry.segments){
   if(typeof segment.text!=='string'||segment.text.length>20000||!Array.isArray(segment.citations))deny('INVALID_EXPORT');
   lines.push('',segment.text);
   for(const card of segment.citations){
    if(card.versionId!==versionId||typeof card.quote!=='string'||card.quote.length>20000)deny('INVALID_EXPORT');
    lines.push('Source: '+card.citationLabel,'Exact quote: '+card.quote,'Version: '+card.versionId,
     'Quote SHA-256: '+card.quoteHash);
   }
  }
 }
 return lines.join('\n')+'\n';
}

const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
async function digest(text){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');}

/** A bounded public snapshot creates a standalone file, with no chat, scripts or API cache. */
export async function offlineSourceDownload({title,versionId,billId,sourceUrl,sourceStatus,canonicalSha256,provisions,savedAt=new Date().toISOString()}={}){
 if(typeof title!=='string'||title.length>300||!id(versionId)||!id(billId)||
   !['draft','introduced','amended','passed_one_chamber','enacted','effective','repealed','unknown'].includes(sourceStatus)||
   !/^[a-f0-9]{64}$/.test(canonicalSha256??'')||!Array.isArray(provisions)||!provisions.length||provisions.length>500||
   !Number.isFinite(Date.parse(savedAt)))deny('INVALID_OFFLINE_SOURCE');
 let url;try{url=new URL(sourceUrl);}catch{deny('INVALID_OFFLINE_SOURCE');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||url.search||
   url.pathname!=='/bills/'+billId+'/versions/'+versionId)deny('INVALID_OFFLINE_SOURCE');
 const seen=new Set();let total=0;
 for(const provision of provisions){
  if(!provision||!id(provision.id)||seen.has(provision.id)||typeof provision.heading!=='string'||provision.heading.length>250||
    typeof provision.text!=='string'||provision.text.length>150000||!/^[a-f0-9]{64}$/.test(provision.sha256??''))deny('INVALID_OFFLINE_SOURCE');
  seen.add(provision.id);total+=new TextEncoder().encode(provision.text).length;
  if(total>1500000||await digest(provision.text)!==provision.sha256)deny('OFFLINE_SOURCE_INTEGRITY_FAILED');
 }
 if(await digest(provisions.map(value=>value.text).join('\n\n'))!==canonicalSha256)deny('OFFLINE_SOURCE_INTEGRITY_FAILED');
 const contents=provisions.map(value=>'<li><a href="#provision-'+escape(value.id)+'">'+escape(value.heading)+'</a></li>').join('');
 const body=provisions.map(value=>'<section id="provision-'+escape(value.id)+'"><h2>'+escape(value.heading)+'</h2><pre>'+escape(value.text)+'</pre><p><a href="'+escape(sourceUrl)+'#provision-'+escape(value.id)+'">Check this exact passage online</a></p><small>Source SHA-256: '+value.sha256+'</small></section>').join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'">'+
  '<title>'+escape(title)+' — offline source</title><style>body{max-width:64rem;margin:2rem auto;padding:0 1.2rem;color:#17293e;background:#fff;font:1rem/1.7 system-ui,sans-serif}h1{line-height:1.2}pre{font:1.1rem/1.8 Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid #63847f;padding:1rem}a{color:#194d83}a:focus-visible{outline:3px solid #135baa}section{margin:2rem 0}small,code{overflow-wrap:anywhere}aside{background:#fff6e5;border:1px solid #dfc28b;padding:1rem}nav{border:1px solid #ccd4df;padding:1rem}nav a{display:inline-block;padding:.2rem}@media print{body{max-width:none;margin:0}nav{display:none}pre{border:0;padding:0}}</style></head><body>'+
  '<a href="#source">Skip to legislation</a><header>Ask Bill — saved public source</header><main id="source"><h1>'+escape(title)+'</h1><aside><strong>Offline snapshot</strong><p>Saved '+escape(savedAt)+'. Document status at download: '+escape(sourceStatus)+'. This file does not update itself. The publication may have changed or been withdrawn since it was saved.</p><p><a href="'+escape(sourceUrl)+'">Check this exact source version online</a> when connected. This copy is not confirmation of current law or legal advice.</p></aside><p>Version: <code>'+escape(versionId)+'</code></p><p>Canonical SHA-256: <code>'+canonicalSha256+'</code></p><nav aria-label="Sections"><h2>Contents</h2><ol>'+contents+'</ol></nav>'+body+'</main><footer>This file contains public source text only. It contains no private questions, microphone recordings, generated answers, or executable scripts.</footer></body></html>';
}
