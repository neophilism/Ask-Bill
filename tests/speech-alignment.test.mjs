import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPronunciationMap,spokenRangeToSource,normalizeSpeechTiming,AlignmentError} from '../packages/voice/alignment/index.mjs';
const bad=code=>e=>e instanceof AlignmentError&&e.code===code;
const source='See § 14 and Sec. 3 of the U.S.C. 😃';
const cp=s=>Array.from(s);
test('only approved English abbreviations expand; numbers, emoji and legal text remain traceable',()=>{
 const m=buildPronunciationMap({text:source,versionId:'v1'});
 assert.equal(m.spokenText,'See Section 14 and Section 3 of the United States Code 😃');
 assert.equal(m.sourceCodePoints,cp(source).length);
 assert.equal(m.spokenCodePoints,cp(m.spokenText).length);
 assert.equal(m.parts.filter(p=>p.kind==='pronunciation').length,3);
 assert(m.parts.every((p,i)=>i===0||p.spokenStart===m.parts[i-1].spokenEnd));
 assert(Object.isFrozen(m));assert(Object.isFrozen(m.parts));
 const start=cp(m.spokenText.split('Section')[0]).length;
 const ref=spokenRangeToSource({mapping:m,start,end:start+7});
 assert.equal(cp(source).slice(ref.start,ref.end).join(''),'§');
 assert.equal(ref.versionId,'v1');
});
test('Spanish reference path keeps statutory wording unchanged rather than silently translating',()=>{
 const m=buildPronunciationMap({text:source,versionId:'v1',locale:'es-ES'});
 assert.equal(m.spokenText,source);
 assert.equal(m.parts.length,1);
 assert.equal(m.parts[0].kind,'verbatim');
});
test('Unicode code point boundaries are mapped correctly around emoji and expanded terms',()=>{
 const m=buildPronunciationMap({text:'😃 Sec. 20, § 3',versionId:'v1'});
 const spoken=cp(m.spokenText),start=spoken.indexOf('2');
 const ref=spokenRangeToSource({mapping:m,start,end:start+2});
 assert.equal(cp('😃 Sec. 20, § 3').slice(ref.start,ref.end).join(''),'20');
 assert.equal(spokenRangeToSource({mapping:m,start:0,end:1}).end,1);
 assert.throws(()=>spokenRangeToSource({mapping:m,start:4,end:4}),bad('INVALID_SPOKEN_RANGE'));
 assert.throws(()=>spokenRangeToSource({mapping:{...m},start:0,end:1}),bad('INVALID_SPOKEN_RANGE'));
});
test('word and viseme timing bind to exact spoken spans and source digests',()=>{
 const m=buildPronunciationMap({text:source,versionId:'v1'});
 const start=cp(m.spokenText.split('Section')[0]).length;
 const first=normalizeSpeechTiming({mapping:m,textHash:m.sourceTextSha256,durationSeconds:2,alignment:'provider',
  words:[{spokenStart:start,spokenEnd:start+7,text:'Section',from:0.1,to:0.6}],
  visemes:[{label:'S',from:0.12,to:0.3},{label:'EH',from:0.3,to:0.5}]});
 assert.equal(first.words[0].sourceStart,cp('See ').length);
 assert.equal(cp(source).slice(first.words[0].sourceStart,first.words[0].sourceEnd).join(''),'§');
 assert.equal(first.playbackAuthorized,false);
 assert(Object.isFrozen(first.words));assert(Object.isFrozen(first.words[0]));
 assert.throws(()=>normalizeSpeechTiming({mapping:m,textHash:'0'.repeat(64),durationSeconds:2}),bad('INVALID_TIMING_ENVELOPE'));
});
test('timing order, text and lifetime errors fail rather than inventing alignment',()=>{
 const m=buildPronunciationMap({text:'Hi there',versionId:'v1'}),base={mapping:m,textHash:m.sourceTextSha256,durationSeconds:2,alignment:'provider'};
 for(const input of [
  {...base,words:[{spokenStart:0,spokenEnd:2,text:'BY',from:0,to:1}]},
  {...base,words:[{spokenStart:0,spokenEnd:2,text:'Hi',from:0,to:2.5}]},
  {...base,words:[{spokenStart:0,spokenEnd:2,text:'Hi',from:1,to:0.5}]},
  {...base,words:[{spokenStart:0,spokenEnd:2,text:'Hi',from:0,to:1},{spokenStart:1,spokenEnd:3,text:'i ',from:1.1,to:1.3}]},
 ])assert.throws(()=>normalizeSpeechTiming(input),bad('WORD_TIMING_INVALID'));
 assert.throws(()=>normalizeSpeechTiming({...base,visemes:[{label:'SCRIPT',from:0,to:1}]}),bad('VISEME_TIMING_INVALID'));
 assert.throws(()=>normalizeSpeechTiming({...base,alignment:'none',words:[{spokenStart:0,spokenEnd:2,text:'Hi',from:0,to:1}]}),bad('TIMING_WITHOUT_ALIGNMENT'));
});
test('input scope rejects malformed locale, surrogates and unbounded material',()=>{
 for(const value of ['',null,'A'.repeat(8001),'\ud800'])
  assert.throws(()=>buildPronunciationMap({text:value,versionId:'v1'}),bad('INVALID_SOURCE_TEXT'));
 for(const badLocale of ['fr','zz',null])
  assert.throws(()=>buildPronunciationMap({text:'Hello',versionId:'v1',locale:badLocale}),bad('INVALID_SOURCE_SCOPE'));
 assert.throws(()=>buildPronunciationMap({text:'Hello',versionId:'../wrong'}),bad('INVALID_SOURCE_SCOPE'));
});
