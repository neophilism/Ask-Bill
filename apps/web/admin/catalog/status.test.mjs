import assert from 'node:assert/strict';
import test from 'node:test';
import {catalogReadiness} from './status.mjs';
const sha='a'.repeat(64);
const ready={sourceComplete:true,warnings:[],errors:[],reviewChecks:['a','b','c','d','e','f'],indexStatus:'ready',canonicalTextSha256:sha};
test('incomplete source never appears ready',()=>{
 const result=catalogReadiness({...ready,sourceComplete:false});
 assert.ok(result.issues.includes('SOURCE_INCOMPLETE'));
 assert.equal(result.informationalReady,false);
 assert.equal(result.canPublish,false);
});
test('stale translated edition is visible',()=>{
 const result=catalogReadiness(ready,{translations:[{language:'es',sourceCanonicalSha256:'b'.repeat(64)}]});
 assert.equal(result.translations[0].status,'STALE_SOURCE');
 assert.equal(result.canPublish,false);
});
test('matching hash is only informative, never publish authorization',()=>{
 const result=catalogReadiness(ready,{translations:[{language:'fr',sourceCanonicalSha256:sha}]});
 assert.equal(result.informationalReady,true);
 assert.equal(result.translations[0].status,'SOURCE_MATCH');
 assert.equal(result.canPublish,false);
});
test('warnings, missing index and invalid digest remain explicit',()=>{
 const result=catalogReadiness({...ready,warnings:['ocr_needs_review:1'],indexStatus:'pending',canonicalTextSha256:''});
 assert.deepEqual(result.issues,['SOURCE_REVIEW_REQUIRED','SEARCH_INDEX_NOT_READY','SOURCE_DIGEST_UNVERIFIED']);
});
