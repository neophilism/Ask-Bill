/** AB-084: exact-version, text-first captions/transcript for trusted validated events. */
export class CaptionError extends Error {
  constructor(code){super(code);this.name='CaptionError';this.code=code;}
}
const fail=code=>{throw new CaptionError(code);};
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const AUDIO_STATES=new Set(['unavailable','playing','paused','stopped','muted']);
const END_STATES=new Set(['answer.completed','answer.cancelled','answer.failed']);
const validId=s=>typeof s==='string'&&ID.test(s);
/**
 * Input MUST come from the independently verified answerView/answer-stream boundary;
 * merely naming an object 'validated' is not source authentication.
 */
function checkedSegment(segment,versionId){
  if(!segment||typeof segment!=='object'||Array.isArray(segment)||!validId(segment.id)||
     segment.versionId!==versionId||typeof segment.text!=='string'||
     !segment.text.trim()||segment.text.length>12000||
     /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(segment.text)||
     !Array.isArray(segment.claims)||segment.claims.length<1||segment.claims.length>20||
     !Array.isArray(segment.claimIds)||segment.claimIds.length!==segment.claims.length||
     !segment.validation||typeof segment.validation!=='object')fail('UNVERIFIED_CAPTION_SEGMENT');
  const labels=[],text=[];
  for(let i=0;i<segment.claims.length;i++){
    const claim=segment.claims[i];
    if(!claim||claim.kind!=='bill_text'||claim.support!=='supported'||
       claim.id!==segment.claimIds[i]||claim.spans?.length!==1||
       claim.text!==claim.spans[0].quote||typeof claim.text!=='string')fail('CAPTION_NOT_SOURCE_BOUND');
    const span=claim.spans[0];
    if(span.sourceVersionId!==versionId||!validId(span.provisionId)||
       typeof span.citationLabel!=='string'||span.citationLabel.length>250||
       typeof span.quote!=='string'||span.quote.length>12000)fail('CAPTION_SOURCE_VERSION_INVALID');
    text.push(claim.text);
    labels.push(Object.freeze({provisionId:span.provisionId,label:span.citationLabel}));
  }
  if(segment.text!==text.join('\n\n'))fail('CAPTION_TEXT_MISMATCH');
  return Object.freeze({id:segment.id,text:segment.text,citations:Object.freeze(labels),corrected:false});
}
export function createCaptionTranscript({answerId,versionId,conversationEpoch,maxSegments=80}={}){
  if(!validId(answerId)||!validId(versionId)||!Number.isSafeInteger(conversationEpoch)||
     conversationEpoch<0||!Number.isSafeInteger(maxSegments)||maxSegments<1||maxSegments>200)
    fail('CAPTION_SCOPE_INVALID');
  let nextSequence=0,status='waiting',audio='unavailable',announcement='',finished=false;
  const segments=[],seen=new Set();
  const checkScope=e=>{
    if(!e||typeof e!=='object'||e.answerId!==answerId||e.documentVersion!==versionId||
       e.conversationEpoch!==conversationEpoch||!Number.isSafeInteger(e.sequence)||e.sequence!==nextSequence)
      fail('STALE_OR_REPLAYED_EVENT');
  };
  const api={
    accept(event){
      if(finished)fail('ANSWER_FINISHED');checkScope(event);
      if(nextSequence===0&&event.type!=='answer.started')fail('ANSWER_START_REQUIRED');
      if(nextSequence>0&&event.type==='answer.started')fail('DUPLICATE_ANSWER_START');
      if(event.type==='answer.started'){
        status='active';announcement='Bill is preparing a source-grounded answer.';
      }else if(event.type==='segment.validated'){
        if(segments.length>=maxSegments)fail('CAPTION_LIMIT');
        const entry=checkedSegment(event.segment,versionId);
        if(seen.has(entry.id))fail('DUPLICATE_SEGMENT');
        seen.add(entry.id);segments.push(entry);announcement='Bill: '+entry.text;
      }else if(event.type==='correction'){
        const entry=checkedSegment(event.segment,versionId);
        if(!validId(event.replacesSegmentId)||seen.has(entry.id))fail('INVALID_CORRECTION');
        const idx=segments.findIndex(x=>x.id===event.replacesSegmentId);
        if(idx<0)fail('INVALID_CORRECTION');
        seen.add(entry.id);
        segments[idx]=Object.freeze({...entry,corrected:true});
        announcement='Bill corrected an earlier statement: '+entry.text;
      }else if(event.type==='citation.ready'||event.type==='performance.cue'||event.type==='speech.ready'){
        // The source drawer and audio controllers handle verified nontext events.
      }else if(END_STATES.has(event.type)){
        finished=true;status=event.type.slice(7);
        announcement=event.type==='answer.completed'?'Bill finished explaining the source.':
          event.type==='answer.cancelled'?'Answer stopped. Source text remains available.':
          'Unable to complete the answer. Source text remains available.';
      }else fail('CAPTION_EVENT_NOT_ALLOWED');
      nextSequence++;
      return api.snapshot();
    },
    setAudioState(value){
      if(!AUDIO_STATES.has(value))fail('CAPTION_AUDIO_STATE_INVALID');
      audio=value;return api.snapshot();
    },
    snapshot(){return Object.freeze({answerId,versionId,conversationEpoch,sequence:nextSequence,
      status,audioState:audio,announcement,segments:Object.freeze([...segments])});},
    toHtml(){return captionTranscriptHtml(api.snapshot());},
    toPlainText(){return [
      'Ask Bill — transcript',
      'Source version: '+versionId,
      ...segments.map(s=>(s.corrected?'Correction: ':'Bill: ')+s.text+'\nSources: '+s.citations.map(c=>c.label).join('; ')),
      'Audio: '+audio
    ].join('\n\n')+'\n';}
  };
  return Object.freeze(api);
}
export function captionTranscriptHtml(view){
  if(!view||!validId(view.answerId)||!validId(view.versionId)||
     !Number.isSafeInteger(view.conversationEpoch)||!Array.isArray(view.segments)||
     view.segments.length>200||!AUDIO_STATES.has(view.audioState)||
     typeof view.announcement!=='string'||view.announcement.length>12030)fail('INVALID_CAPTION_VIEW');
  const entries=view.segments.map(s=>{
    if(!validId(s.id)||typeof s.text!=='string'||s.text.length>12000||!Array.isArray(s.citations)||s.citations.length>20)
      fail('INVALID_CAPTION_VIEW');
    const links=s.citations.map(c=>{
      if(!validId(c.provisionId)||typeof c.label!=='string'||c.label.length>250)fail('INVALID_CAPTION_VIEW');
      return '<a href="#provision-'+escape(c.provisionId)+'">'+escape(c.label)+'</a>';
    }).join(', ');
    return '<li data-segment-id="'+escape(s.id)+'"><p><strong>Bill'+(s.corrected?' — correction':'')+'</strong>: <span class="selectable-caption">'+escape(s.text)+'</span></p><p class="caption-citations">Exact source: '+links+'</p></li>';
  }).join('');
  const states={unavailable:'Voice unavailable — read the transcript.',playing:'Speaking — transcript remains visible.',
    paused:'Voice paused — transcript remains visible.',stopped:'Voice stopped — transcript remains visible.',muted:'Voice muted — transcript remains visible.'};
  return '<section class="bill-captions" role="region" aria-label="Ask Bill selectable transcript" data-version="'+
    escape(view.versionId)+'"><h2>Transcript</h2><p class="caption-announcement" aria-live="polite" aria-atomic="true">'+
    escape(view.announcement)+'</p><ol aria-label="Bill responses">'+entries+'</ol><p role="status">'+
    escape(states[view.audioState])+'</p></section>';
}
