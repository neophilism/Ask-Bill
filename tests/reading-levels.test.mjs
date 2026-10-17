import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createReadingLevelCard,initialEphemeralReadingLevel,switchEphemeralReadingLevel,sourceReadingCardHtml,ReadingLevelError} from '../packages/grounding/style/index.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),t='Submissions arrive at the portal. Exception: outage submissions are delayed.';
const v='v1',source={versionId:v,publication:'published',sourceComplete:true,canonicalText:t,sha256:sha(t),decisionsRequireExceptions:true};
const cp=Array.from(t),main={versionId:v,start:0,end:cp.length,quote:t,quoteHash:sha(t)};
const sub=t.indexOf('Exception:'),exception={versionId:v,start:sub,end:cp.length,quote:t.slice(sub),quoteHash:sha(t.slice(sub))};
test('three reading levels keep the same legal words and decisive exception unchanged',()=>{
 const levels=['simple','standard','concise'].map(level=>createReadingLevelCard({level,versionId:v,source,mainSpan:main,decisiveExceptions:[exception]}));
 assert.equal(new Set(levels.map(x=>x.originalQuote)).size,1);
 assert.equal(new Set(levels.map(x=>x.decisiveExceptions[0].quote)).size,1);
 assert.equal(levels[0].isAgeClassification,false);assert.equal(levels[0].claimsPersonalAdvice,false);
 assert.notEqual(levels[0].introduction,levels[1].introduction);
});
test('missing decisive exception, wrong version and changed quote cannot become source cards',()=>{
 const base={versionId:v,source,mainSpan:main,decisiveExceptions:[exception]};
 assert.throws(()=>createReadingLevelCard({...base,decisiveExceptions:[]}),ReadingLevelError);
 assert.throws(()=>createReadingLevelCard({...base,versionId:'v2'}),ReadingLevelError);
 assert.throws(()=>createReadingLevelCard({...base,source:{...source,canonicalText:'tampered'}}),ReadingLevelError);
 assert.throws(()=>createReadingLevelCard({...base,mainSpan:{...main,quoteHash:sha('tampered')}}),ReadingLevelError);
 assert.throws(()=>createReadingLevelCard({...base,source:{...source,publication:'private'}}),ReadingLevelError);
});
test('ephemeral preferences never imply age, store history, or auto-follow a new version',()=>{
 let state=initialEphemeralReadingLevel('v1');
 assert.equal(state.relatedToAge,false);assert.equal(state.storage,'session_memory_only');
 state=switchEphemeralReadingLevel(state,'simple','v1');
 assert.equal(state.historyPersisted,false);assert.equal(state.changedDocument,false);
 state=switchEphemeralReadingLevel(state,'concise','v2');
 assert.equal(state.changedDocument,true);assert.equal(state.documentVersion,'v2');
 assert.throws(()=>switchEphemeralReadingLevel(state,'juvenile','v2'),ReadingLevelError);
});
test('presented source escapes user-controlled legislative HTML and preserves exception',()=>{
 const malicious='Do not click <script>alert(1)</script>. Exception: text & images.';
 const inp={...source,canonicalText:malicious,sha256:sha(malicious)};
 const section=malicious.slice(malicious.indexOf('Exception:'));
 const card=createReadingLevelCard({versionId:v,source:inp,
   mainSpan:{versionId:v,start:0,end:Array.from(malicious).length,quote:malicious,quoteHash:sha(malicious)},
   decisiveExceptions:[{versionId:v,start:malicious.indexOf('Exception:'),end:Array.from(malicious).length,quote:section,quoteHash:sha(section)}]});
 const html=sourceReadingCardHtml(card);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Exception in exact source/);
});
