import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildSearchGeneration,searchGeneration,FixtureIndexPointer,sqlSearchQuery,SearchError} from '../packages/content/search/index.mjs';
import {readFile} from 'node:fs/promises';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',v='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',v2='bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb';
const p1='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',p2='aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa';
const sha=t=>createHash('sha256').update(t).digest('hex');
const sourceHash=sha('complete-fixed-version');
const entry=(id,text,versionId=v,publisherId=a)=>({publisherId,versionId,provisionId:id,text,textSha256:sha(text)});
const create=(entries=[entry(p1,'The public may file a request. 😃'),entry(p2,'Exceptions to public filing appear in Section 2.')])=>buildSearchGeneration({publisherId:a,versionId:v,sourceHash,provisions:entries});
test('immutable deterministic generation is independent of provision order',()=>{
 const one=create(),reverse=create([entry(p2,'Exceptions to public filing appear in Section 2.'),entry(p1,'The public may file a request. 😃')]);
 assert.equal(one.generationHash,reverse.generationHash);assert.equal(one.entryCount,2);assert.equal(one.publicationAllowed,false);
 assert(Object.isFrozen(one.entries));assert(Object.isFrozen(one.entries[0]));assert.equal(one.sourceHash,sourceHash);
});
test('scoped phrase search returns only correct source and retains exact text',()=>{
 const g=create();
 const result=searchGeneration(g,{publisherId:a,versionId:v,query:'public filing'});
 assert.equal(result.results.length,2);assert.equal(result.results[0].provisionId,p2);assert.equal(result.results[1].provisionId,p1);
 assert.equal(result.results[0].matchedExactPhrase,true);
 assert.equal(result.citationOffsetPolicy,'reverify-against-original-unicode-text');
 const accent=searchGeneration(g,{publisherId:a,versionId:v,query:'😃'});
 assert.equal(accent.results.length,1);assert.equal(accent.results[0].provisionId,p1);
});
test('tenant, version, scope and source hashes fail closed',()=>{
 const g=create();
 assert.throws(()=>searchGeneration(g,{publisherId:b,versionId:v,query:'filing'}),e=>e.code==='INDEX_SCOPE');
 assert.throws(()=>searchGeneration(g,{publisherId:a,versionId:v2,query:'filing'}),e=>e.code==='INDEX_SCOPE');
 assert.throws(()=>create([entry(p1,'Correct bytes'),entry(p2,'Tampered',v,b)]),e=>e.code==='SOURCE_SCOPE');
 assert.throws(()=>create([entry(p1,'Correct bytes'),entry(p1,'Correct bytes')]),e=>e.code==='DUPLICATE_PROVISION');
 assert.throws(()=>buildSearchGeneration({publisherId:a,versionId:v,sourceHash,provisions:[{...entry(p1,'Hello'),textSha256:'a'.repeat(64)}]}),e=>e.code==='SOURCE_HASH_MISMATCH');
});
test('atomic pointer fixture rejects stale writer and never activates incomplete generation',()=>{
 const pointer=new FixtureIndexPointer(),one=create();
 assert.deepEqual(pointer.swap(one),{previous:null,current:one.generationHash,versionId:v});
 assert.equal(pointer.get(a,v).generationHash,one.generationHash);
 const next=create([entry(p1,'Changed text'),entry(p2,'The exception remains.')]);
 assert.throws(()=>pointer.swap(next),e=>e.code==='INDEX_ACTIVATION_CONFLICT');
 pointer.swap(next,{expectedPrevious:one.generationHash});
 assert.equal(pointer.get(a,v).generationHash,next.generationHash);
 assert.throws(()=>pointer.swap({...next,state:'failed'},{expectedPrevious:next.generationHash}),e=>e.code==='INDEX_ACTIVATION_CONFLICT');
});
test('query limits and bad Unicode cannot create citations or expensive scans',()=>{
 const g=create();
 for(const query of ['', 'x', 'a'.repeat(201), '\ud800']){
  assert.throws(()=>searchGeneration(g,{publisherId:a,versionId:v,query}),SearchError);
 }
 assert.throws(()=>searchGeneration(g,{publisherId:a,versionId:v,query:'request',limit:1000}),SearchError);
});
test('SQL query binds tenant, version and lexical query with active-generation join',()=>{
 const q=sqlSearchQuery({publisherId:a,versionId:v,query:'filing',limit:3});
 assert.match(q.sql,/JOIN ask_bill.search_entries/);assert.match(q.sql,/a.publisher_id=\$1::uuid/);assert.match(q.sql,/a.version_id=\$2::uuid/);
 assert.equal(q.params[2],'filing');assert.equal(q.params[3],3);assert(!q.sql.includes(a));assert(Object.isFrozen(q.params));
 assert.throws(()=>sqlSearchQuery({publisherId:"' OR true --",versionId:v,query:'filing'}),SearchError);
});
test('migration enforces generation immutability, exact source hashes and FORCE RLS',async()=>{
 const sql=await readFile(new URL('../migrations/004_search.sql',import.meta.url),'utf8');
 for(const table of ['search_generations','search_entries','search_active']){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS ask_bill\\.'+table));
  assert.match(sql,new RegExp('ALTER TABLE ask_bill\\.'+table+' FORCE ROW LEVEL SECURITY;'));
 }
 assert.match(sql,/CREATE OR REPLACE FUNCTION ask_bill.activate_search_generation/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/current_publisher_id\(\)/);
 assert.match(sql,/status='complete'/);
 assert.match(sql,/guard_search_entry/);
 assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|SCHEMA)\b/i);
});
