import assert from 'node:assert/strict';
import test from 'node:test';
import {catalogReadiness} from './status.mjs';
import {renderPublisherBill,renderPublisherVersion} from '../views/index.mjs';
const sha='a'.repeat(64);
const ready={sourceComplete:true,warnings:[],errors:[],reviewChecks:['a','b','c','d','e','f'],indexStatus:'complete',canonicalTextSha256:sha};
test('incomplete source never appears ready',()=>{const r=catalogReadiness({...ready,sourceComplete:false});assert.ok(r.issues.includes('SOURCE_INCOMPLETE'));assert.equal(r.canPublish,false);});
test('stale translation blocks aggregate informational readiness',()=>{const r=catalogReadiness(ready,{translations:[{language:'es',sourceCanonicalSha256:'b'.repeat(64)}]});assert.equal(r.translations[0].status,'STALE_SOURCE');assert.ok(r.issues.includes('TRANSLATION_SOURCE_STALE'));assert.equal(r.informationalReady,false);assert.equal(r.canPublish,false);});
test('matching hash remains non-authorizing',()=>{const r=catalogReadiness(ready,{translations:[{language:'fr',sourceCanonicalSha256:sha.toUpperCase()}]});assert.equal(r.informationalReady,true);assert.equal(r.translations[0].status,'SOURCE_MATCH');assert.equal(r.canPublish,false);});
test('search status must match durable complete state',()=>{const r=catalogReadiness({...ready,indexStatus:'ready'});assert.ok(r.issues.includes('SEARCH_INDEX_NOT_READY'));assert.equal(r.informationalReady,false);});
test('missing review arrays and invalid digest fail closed',()=>{const r=catalogReadiness({...ready,warnings:null,indexStatus:'pending',canonicalTextSha256:''});assert.ok(r.issues.includes('SOURCE_REVIEW_REQUIRED'));assert.ok(r.issues.includes('SEARCH_INDEX_NOT_READY'));assert.ok(r.issues.includes('SOURCE_DIGEST_UNVERIFIED'));});
test('malformed translation catalogs rejected',()=>{assert.throws(()=>catalogReadiness(ready,{translations:{}}));assert.throws(()=>catalogReadiness(ready,{translations:Array.from({length:101},()=>({}))}));});
test('publisher history and version detail expose stale translation and pack gaps',()=>{
 const context={role:'viewer',csrfToken:'c',recentMfa:false};
 const version={...ready,id:'version-1',billId:'bill-1',title:'Review source',publication:'private',status:'draft',
   createdAt:'2026-10-18T00:00:00Z',rawByteSha256:sha,provisions:[],sourceComplete:false,
   translations:[{language:'es',sourceCanonicalSha256:'b'.repeat(64)}]};
 const bill={id:'bill-1',title:'Review source',jurisdiction:'United States',versions:[version]};
 const history=renderPublisherBill({context,bill});
 const detail=renderPublisherVersion({context,version});
 assert.match(history,/Translation source stale/);
 assert.match(detail,/The original source is not marked complete/);
 assert.match(detail,/Source has changed; review this translation again/);
});
test('translation language cannot inject publisher markup',()=>{
 const context={role:'viewer',csrfToken:'c',recentMfa:false};
 const version={...ready,id:'version-1',billId:'bill-1',title:'Review source',publication:'private',status:'draft',
   rawByteSha256:sha,provisions:[],translations:[{language:'<script>alert(1)</script>',sourceCanonicalSha256:sha}]};
 const html=renderPublisherVersion({context,version});
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});

