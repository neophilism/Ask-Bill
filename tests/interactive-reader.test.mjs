import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {renderInteractiveReader,renderPublishedReader,createPublicReader} from '../packages/ui/reader/index.mjs';
import {normalizeReaderSelection,createReaderAnswerConsumer,consumeReaderResponse,createReaderPreferences,conversationDownload,offlineSourceDownload} from '../packages/ui/reader/client-core.mjs';

const publisherId='11111111-1111-4111-8111-111111111111',billId='22222222-2222-4222-8222-222222222222',versionId='33333333-3333-4333-8333-333333333333';
const hash=text=>createHash('sha256').update(text,'utf8').digest('hex');
const text='A proposed rule 😃 requires a receipt. <script>inert</script>';
const provision={id:'section-1',heading:'Section <1>',text,sha256:hash(text)};
const pack={schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',publisherId,billId,versionId,
 title:'Synthetic <bill>',language:'en-US',jurisdiction:'United States',status:'introduced',publication:'published',sourceComplete:true,
 retrievedAt:'2026-10-16T20:00:00Z',publishedAt:'2026-10-16T22:00:00Z',canonicalSha256:hash(text),provisions:[provision]};
const span={sourceVersionId:versionId,provisionId:provision.id,start:0,end:Array.from(text).length,quote:text,quoteHash:hash(text),citationLabel:provision.heading,originalLocator:{}};
const claim={id:'claim-1',kind:'bill_text',support:'supported',text,spans:[span],qualifications:[]};
const segment={id:'segment-1',text,claimIds:['claim-1'],claims:[claim],versionId,
 validation:{schema:'v1',retrievalConfig:hash('retrieval'),promptConfig:hash('prompt'),validatorConfig:hash('validator'),validatedAt:'2026-10-17T12:00:00Z'}};
const event=(type,sequence,payload={})=>({schemaVersion:1,answerId:'answer-1',documentVersion:versionId,conversationEpoch:1,
 createdAt:'2026-10-17T12:00:00Z',type,sequence,...payload});
const events=()=>[event('answer.started',0),event('segment.validated',1,{segment}),event('citation.ready',2,{span}),event('answer.completed',3)];
const lookup=async id=>id===provision.id?{...provision,versionId,publication:'published',sourceComplete:true}:undefined;
const consumer=(options={})=>createReaderAnswerConsumer({versionId,epoch:1,sourceLookup:lookup,...options});
const streamResponse=(value,{chunk=29,type='text/event-stream'}={})=>{
 const bytes=new TextEncoder().encode(value);let offset=0;
 return new Response(new ReadableStream({pull(controller){if(offset===bytes.length){controller.close();return;}
  controller.enqueue(bytes.slice(offset,offset+chunk));offset=Math.min(bytes.length,offset+chunk);}}),{headers:{'Content-Type':type}});
};
const sse=list=>list.map(value=>'id: '+value.sequence+'\nevent: '+value.type+'\ndata: '+JSON.stringify(value)+'\n\n').join('');

test('enhanced reader is opt-in, escapes every source, and keeps no-JS links and exact text',async()=>{
 const fallback=renderPublishedReader(pack),html=renderInteractiveReader(pack);
 assert(!fallback.includes('<script'));
 assert.equal((html.match(/<script /g)||[]).length,1);
 assert(html.includes('type="module" src="/reader-client.mjs"'));
 assert(html.includes('&lt;script&gt;inert&lt;/script&gt;'));
 assert(!html.includes('<script>inert'));
 assert(html.includes('action="/bills/'+billId+'/versions/'+versionId+'/search"'));
 assert(html.includes('/tour/1'));assert(html.includes('/share?section=section-1'));
 assert(html.includes('id="session-form"'));assert(html.includes('value="under-13"'));
 assert(html.includes('id="session-controls" hidden'));assert(!html.includes('autoplay'));
 const read=createPublicReader({lookupPublishedPack:async()=>pack,interactive:true});
 assert.equal(await read.read({publisherId,billId,versionId}),html);
 assert(!((await read.read({publisherId,billId,versionId,format:'text'})).includes('reader-client')));
 assert.throws(()=>createPublicReader({lookupPublishedPack:async()=>pack,interactive:'yes'}));
});

test('DOM selection is converted to code-point offsets and rejects partial surrogate pairs',()=>{
 const start=text.indexOf('😃'),selected='😃 requires';
 const selection=normalizeReaderSelection({provisionId:provision.id,text,startUTF16:start,endUTF16:start+selected.length,selectedText:selected});
 assert.equal(selection.start,Array.from(text.slice(0,start)).length);
 assert.equal(selection.end-selection.start,Array.from(selected).length);
 assert.equal(Array.from(text).slice(selection.start,selection.end).join(''),selected);
 assert.throws(()=>normalizeReaderSelection({provisionId:provision.id,text,startUTF16:start+1,endUTF16:start+2,selectedText:text.slice(start+1,start+2)}));
 assert.throws(()=>normalizeReaderSelection({...selection,text,startUTF16:0,endUTF16:4,selectedText:'fake'}));
});

test('reader verifies chunked Unicode SSE, citations and terminal state before completion',async()=>{
 const updates=[];
 const state=await consumeReaderResponse(streamResponse(sse(events()),{chunk:1}),{consumer:consumer({onUpdate:update=>updates.push(update)})});
 assert.equal(state.finished,true);assert.equal(state.eventCount,4);
 assert.equal(state.segments[0].text,text);assert.equal(state.segments[0].citations[0].quote,text);
 assert.equal(state.segments[0].label,'Exact source quotation');
 assert.equal(updates.length,4);
 const json=await consumeReaderResponse(streamResponse(JSON.stringify({events:events()}),{type:'application/json'}),{consumer:consumer()});
 assert.equal(json.segments[0].id,segment.id);
});

test('invalid hash, cross-version text, reordered events and incomplete streams never render',async()=>{
 for(const altered of [
  [events()[0],{...events()[1],documentVersion:'another-version'}],
  [events()[0],{...events()[1],sequence:2}],
  [events()[0],{...events()[1],segment:{...segment,claims:[{...claim,spans:[{...span,quoteHash:hash('fake')}]}]}}]
 ]){
  const updates=[];await assert.rejects(()=>consumeReaderResponse(streamResponse(sse(altered)),{consumer:consumer({onUpdate:update=>updates.push(update)})}));
  assert.equal(updates.flatMap(update=>update.segments).length,0);
 }
 await assert.rejects(()=>consumeReaderResponse(streamResponse(sse(events().slice(0,2))),{consumer:consumer()}),error=>error.code==='INCOMPLETE_ANSWER_STREAM');
 await assert.rejects(()=>consumeReaderResponse(streamResponse(sse(events()).trimEnd()),{consumer:consumer()}),error=>error.code==='INCOMPLETE_EVENT_FRAME');
 await assert.rejects(()=>consumeReaderResponse(streamResponse(sse(events()).replace('event: answer.started','event: answer.failed')),{consumer:consumer()}),error=>error.code==='INVALID_EVENT_FRAME');
});

test('cancellation during asynchronous source verification prevents late answer resurrection',async()=>{
 let current=true,release;
 const pending=new Promise(resolve=>{release=resolve;}),updates=[];
 const target=consumer({isCurrent:()=>current,sourceLookup:async()=>{await pending;return lookup(provision.id);},onUpdate:update=>updates.push(update)});
 await target.accept(events()[0]);const held=target.accept(events()[1]);current=false;release();
 await assert.rejects(()=>held,error=>error.code==='STALE_ANSWER');
 assert.equal(updates.length,1);assert.equal(target.snapshot().segments.length,0);
});

test('corrections replace the old visible segment and old events cannot reappear after terminal',async()=>{
 const target=consumer();await target.accept(events()[0]);await target.accept(events()[1]);
 const corrected={...segment,id:'segment-2'};
 const update=await target.accept(event('correction',2,{replacesSegmentId:segment.id,segment:corrected}));
 assert.equal(update.segments.length,1);assert.equal(update.segments[0].id,'segment-2');
 await target.accept(event('answer.completed',3));await assert.rejects(()=>target.accept(event('citation.ready',4,{span})));
});

test('tab preferences keep only permitted version-bound IDs and work without storage access',()=>{
 const values=new Map();const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const prefs=createReaderPreferences({versionId,provisionIds:[provision.id],storage});
 prefs.setTextSize('large');prefs.setReadingLevel('simple');prefs.toggleBookmark(provision.id);
 assert.deepEqual(createReaderPreferences({versionId,provisionIds:[provision.id],storage}).snapshot(),{readingLevel:'simple',textSize:'large',bookmarks:[provision.id]});
 assert(![...values.values()][0].includes('question'));assert.throws(()=>prefs.toggleBookmark('private-other-version'));
 prefs.clear();assert.equal(values.size,0);
 const blocked=createReaderPreferences({versionId,provisionIds:[provision.id],storage:{getItem(){throw Error();},setItem(){throw Error();}}});
 assert.equal(blocked.toggleBookmark(provision.id).bookmarks.length,1);
 const wrong=createReaderPreferences({versionId:'different',provisionIds:[provision.id],storage});assert.equal(wrong.snapshot().bookmarks.length,0);
});

test('explicit downloads include questions, exact sources and version while rejecting another version',async()=>{
 const target=consumer();for(const value of events())await target.accept(value);
 const entries=[{question:'Where is the receipt rule?',status:'completed',segments:target.snapshot().segments}];
 const output=conversationDownload({title:pack.title,versionId,sourceUrl:'https://ask-bill.example/bills/source',entries});
 assert(output.includes(entries[0].question));assert(output.includes('Quote SHA-256: '+hash(text)));assert(output.includes(versionId));
 assert.throws(()=>conversationDownload({title:pack.title,versionId:'another',sourceUrl:'https://ask-bill.example',entries}));
});

test('offline download is bounded, source-hash verified, inert and clearly labels future staleness',async()=>{
 const input={title:pack.title,billId,versionId,sourceStatus:pack.status,canonicalSha256:pack.canonicalSha256,
  sourceUrl:'https://ask-bill.example/bills/'+billId+'/versions/'+versionId,provisions:pack.provisions};
 const html=await offlineSourceDownload(input);
 assert(html.includes('Offline snapshot'));assert(html.includes('publication may have changed or been withdrawn'));
 assert(html.includes('&lt;script&gt;inert&lt;/script&gt;'));assert(!html.includes('<script'));
 assert(!html.includes('reader-client'));assert(!html.includes('<textarea'));assert(html.includes(hash(text)));
 await assert.rejects(()=>offlineSourceDownload({...input,provisions:[{...provision,text:'tampered'}]}));
 await assert.rejects(()=>offlineSourceDownload({...input,sourceUrl:'javascript:alert(1)'}));
 await assert.rejects(()=>offlineSourceDownload({...input,canonicalSha256:hash('different')}));
});
