import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceCandidate,privateSourceObjectKey,recordSourceObjectQuery,findSourceObjectQuery,recordSourceEventQuery,assertMatchingStoredObject,SourceError} from '../packages/content/provenance/index.mjs';
const publisher='11111111-1111-4111-8111-111111111111';
const bill='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const version='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
const source={publisherId:publisher,billId:bill,versionId:version,origin:'official',rawBytes:Buffer.from('Section 1 says X.'),mime:'text/plain',sourceUrl:'https://www.congress.gov/bill/119th-congress/house-bill/1/text',retrievedAt:'2026-10-16T19:00:00Z',canonicalizationVersion:'v1'};
const bad=(fn,code)=>assert.throws(fn,e=>e instanceof SourceError&&e.code===code);
test('raw bytes produce deterministic immutable digest but are never returned',()=>{
 const a=createSourceCandidate(source);const b=createSourceCandidate({...source,rawBytes:Uint8Array.from(source.rawBytes)});
 assert.equal(a.sha256,b.sha256);assert.equal(a.sha256.length,64);assert(Object.isFrozen(a));
 assert.equal(a.rawBytes,undefined);assert.equal(a.byteLength,source.rawBytes.length);
 const changed=createSourceCandidate({...source,rawBytes:Buffer.from('Section 1 says Y.')});assert.notEqual(a.sha256,changed.sha256);
});
test('official source URLs are strictly HTTPS allowlisted and private uploads require no public URL',()=>{
 for(const url of ['https://evil.example/law','http://congress.gov/','https://congress.gov.evil.example/','https://username:secret@congress.gov/a','https://127.0.0.1/a','https://congress.gov/a#frag'])bad(()=>createSourceCandidate({...source,sourceUrl:url}),'SOURCE_URL_INVALID');
 bad(()=>createSourceCandidate({...source,sourceUrl:null}),'SOURCE_URL_REQUIRED');
 const upload=createSourceCandidate({...source,origin:'publisher-upload',sourceUrl:null});assert.equal(upload.sourceUrl,null);
 bad(()=>createSourceCandidate({...source,origin:'publisher-upload'}),'PRIVATE_URL_FORBIDDEN');
});
test('UUID, content type, canonicalization and retrieval time enforce bounds',()=>{
 bad(()=>createSourceCandidate({...source,publisherId:'not-uuid'}),'INVALID_PUBLISHER');
 bad(()=>createSourceCandidate({...source,mime:'text/html'}),'MIME_INVALID');
 bad(()=>createSourceCandidate({...source,rawBytes:new Uint8Array(0)}),'SOURCE_SIZE_INVALID');
 bad(()=>createSourceCandidate({...source,rawBytes:'hello'}),'SOURCE_SIZE_INVALID');
 bad(()=>createSourceCandidate({...source,canonicalizationVersion:'../unsafe'}),'CANON_VERSION_INVALID');
 bad(()=>createSourceCandidate({...source,retrievedAt:'2026-02-30T00:00:00Z'}),'RETRIEVAL_TIME_INVALID');
});
test('private object references are hash-addressed and safe',()=>{
 const c=createSourceCandidate(source),k=privateSourceObjectKey(c);assert.equal(k,publisher+'/sha256/'+c.sha256);
 bad(()=>recordSourceObjectQuery(c,publisher+'/../../../private'),'STORAGE_KEY_INVALID');
 const query=recordSourceObjectQuery(c,k);assert(!query.sql.includes(publisher));assert.equal(query.params[0],publisher);
 assert(Object.isFrozen(query.params));assert.equal(findSourceObjectQuery(c).params[1],c.sha256);
});
test('deduplication refuses alternate storage object metadata and only records source versions by UUID',()=>{
 const c=createSourceCandidate(source),key=privateSourceObjectKey(c);
 assert.equal(assertMatchingStoredObject(c,key,{byte_length:c.byteLength,mime_type:c.mime,storage_key:key}),true);
 bad(()=>assertMatchingStoredObject(c,key,{byte_length:2,mime_type:c.mime,storage_key:key}),'SOURCE_COLLISION');
 const e=recordSourceEventQuery(c,'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb');assert.equal(e.params[0],publisher);assert.equal(e.params[2],version);
 bad(()=>recordSourceEventQuery(c,"'; DROP TABLE publishers; --"),'INVALID_SOURCE_OBJECT');
});
