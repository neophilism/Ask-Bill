import test from 'node:test';import assert from 'node:assert/strict';
import {createCaptionTranscript,captionTranscriptHtml,CaptionError} from '../packages/ui/captions/index.mjs';
const bad=code=>e=>e instanceof CaptionError&&e.code===code;
const versionId='bill-v1',answerId='answer-1',conversationEpoch=3;
const event=(sequence,type,rest={})=>({answerId,documentVersion:versionId,conversationEpoch,sequence,type,...rest});
const segment=(id='seg-1',text='The draft states <important> provisions.',label='Section <1>')=>({
 id,text,versionId,claimIds:['claim-1'],claims:[{id:'claim-1',kind:'bill_text',support:'supported',text,
   spans:[{sourceVersionId:versionId,provisionId:'sec-1',citationLabel:label,quote:text}]}],validation:{schema:'v1'}});
test('source-bound transcript is selectable plain text with keyboard-operable citation links',()=>{
 const t=createCaptionTranscript({answerId,versionId,conversationEpoch});
 t.accept(event(0,'answer.started'));
 const view=t.accept(event(1,'segment.validated',{segment:segment()}));
 assert.equal(view.segments.length,1);assert.equal(view.audioState,'unavailable');
 const html=t.toHtml();
 assert.match(html,/aria-label="Ask Bill selectable transcript"/);assert.match(html,/aria-live="polite"/);
 assert.match(html,/href="#provision-sec-1"/);
 assert.match(html,/&lt;important&gt;/);assert.match(html,/Section &lt;1&gt;/);
 assert.doesNotMatch(html,/<important>/);
 assert.match(t.toPlainText(),/Source version: bill-v1/);
 assert(Object.isFrozen(view.segments));
});
test('mute and pause cannot erase or alter visible exact-source words',()=>{
 const t=createCaptionTranscript({answerId,versionId,conversationEpoch});
 t.accept(event(0,'answer.started'));t.accept(event(1,'segment.validated',{segment:segment()}));
 const text=t.snapshot().segments[0].text;
 for(const audio of ['playing','paused','muted','stopped','unavailable']){
  t.setAudioState(audio);assert.equal(t.snapshot().segments[0].text,text);
  assert.match(t.toHtml(),/transcript remains visible|Voice unavailable/);
 }
 assert.throws(()=>t.setAudioState('voice-activated'),bad('CAPTION_AUDIO_STATE_INVALID'));
});
test('corrections replace one approved segment, explicitly labeled and announced once',()=>{
 const t=createCaptionTranscript({answerId,versionId,conversationEpoch});
 t.accept(event(0,'answer.started'));t.accept(event(1,'segment.validated',{segment:segment()}));
 const v=t.accept(event(2,'correction',{replacesSegmentId:'seg-1',segment:segment('seg-2','The draft contains a correction.')}));
 assert.equal(v.segments.length,1);assert.equal(v.segments[0].corrected,true);
 assert.match(v.announcement,/Bill corrected/);assert.match(t.toHtml(),/Bill — correction/);
 assert.doesNotMatch(t.toHtml(),/important/);
});
test('stale version, wrong epoch and replayed sequence fail without mutating captions',()=>{
 const t=createCaptionTranscript({answerId,versionId,conversationEpoch});
 t.accept(event(0,'answer.started'));
 for(const e of [event(0,'answer.started'),{...event(1,'segment.validated',{segment:segment()}),documentVersion:'bill-v2'},
     {...event(1,'segment.validated',{segment:segment()}),conversationEpoch:4},
     {...event(2,'segment.validated',{segment:segment()}),answerId:'other'}])
  assert.throws(()=>t.accept(e),bad('STALE_OR_REPLAYED_EVENT'));
 assert.equal(t.snapshot().segments.length,0);
 t.accept(event(1,'segment.validated',{segment:segment()}));
 assert.equal(t.snapshot().segments.length,1);
});
test('source claim paraphrases, unsupported support and cross-version spans fail closed',()=>{
 const t=createCaptionTranscript({answerId,versionId,conversationEpoch});t.accept(event(0,'answer.started'));
 for(const s of [{...segment(),text:'Invented summary'},
                 {...segment(),claims:[{...segment().claims[0],support:'qualified'}]},
                 {...segment(),claims:[{...segment().claims[0],spans:[{...segment().claims[0].spans[0],sourceVersionId:'bill-v2'}]}]}]){
   assert.throws(()=>t.accept(event(1,'segment.validated',{segment:s})),CaptionError);
 }
 assert.equal(t.snapshot().segments.length,0);
});
test('after failure/cancellation no delayed events or audio can revive the answer',()=>{
 const t=createCaptionTranscript({answerId,versionId,conversationEpoch});
 t.accept(event(0,'answer.started'));
 t.accept(event(1,'answer.cancelled'));
 assert.match(t.toHtml(),/Answer stopped/);
 assert.throws(()=>t.accept(event(2,'segment.validated',{segment:segment()})),bad('ANSWER_FINISHED'));
 const t2=createCaptionTranscript({answerId,versionId,conversationEpoch});
 t2.accept(event(0,'answer.started'));t2.accept(event(1,'answer.failed'));
 assert.match(t2.toHtml(),/Unable to complete/);
});
test('bounded transcript refuses overflow and duplicate corrections',()=>{
 const t=createCaptionTranscript({answerId,versionId,conversationEpoch,maxSegments:1});
 t.accept(event(0,'answer.started'));t.accept(event(1,'segment.validated',{segment:segment()}));
 assert.throws(()=>t.accept(event(2,'segment.validated',{segment:segment('seg-2')})),bad('CAPTION_LIMIT'));
 assert.throws(()=>t.accept(event(2,'correction',{replacesSegmentId:'missing',segment:segment('seg-3')})),bad('INVALID_CORRECTION'));
 t.accept(event(2,'correction',{replacesSegmentId:'seg-1',segment:segment('seg-4')}));
 assert.throws(()=>t.accept(event(3,'correction',{replacesSegmentId:'seg-4',segment:segment('seg-4')})),bad('INVALID_CORRECTION'));
});
test('renderer rejects malicious untrusted snapshot fields before HTML output',()=>{
 const t=createCaptionTranscript({answerId,versionId,conversationEpoch});
 const valid=t.snapshot();assert.throws(()=>captionTranscriptHtml({...valid,versionId:'<script>'}),bad('INVALID_CAPTION_VIEW'));
 assert.throws(()=>captionTranscriptHtml({...valid,audioState:'xx'}),bad('INVALID_CAPTION_VIEW'));
 assert.throws(()=>captionTranscriptHtml({...valid,segments:Array(201).fill({})}),bad('INVALID_CAPTION_VIEW'));
});
