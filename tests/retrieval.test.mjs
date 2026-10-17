import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildSearchGeneration} from '../packages/content/search/index.mjs';
import {buildRelationGraph} from '../packages/content/references/index.mjs';
import {retrieveEvidence,RetrievalError} from '../packages/grounding/retrieval/index.mjs';
const pub='11111111-1111-4111-8111-111111111111',v='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
 ids=['aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa','aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa'];
const sha=t=>createHash('sha256').update(t).digest('hex');
const source=[
 {id:ids[0],versionId:v,kind:'section',label:'SEC. 1.',text:'Receipt happens at intake. Except as provided in Section 3, the submission is accepted.'},
 {id:ids[1],versionId:v,kind:'section',label:'SEC. 2.',text:'The term “submission” means a filing.'},
 {id:ids[2],versionId:v,kind:'section',label:'SEC. 3.',text:'Unless an outage occurs, the intake rule applies.'}
];
const index=buildSearchGeneration({publisherId:pub,versionId:v,sourceHash:sha('version-source-v1'),
 provisions:source.map(p=>({publisherId:pub,versionId:v,provisionId:p.id,text:p.text,textSha256:sha(p.text)}))});
const graph=buildRelationGraph({versionId:v,provisions:source});
const routeFor=(q)=>({status:'allowed',sourcePublished:true,noModelToolExecution:true,allowedVersionIds:[v],
 versionId:v,publisherId:pub,category:'bill_explanation',questionSha256:sha(q)});
const query=(q='Receipt',overrides={})=>({route:routeFor(q),index,graph,question:q,...overrides});
test('retrieval is source-hash-validated and includes controlling exceptions',()=>{
 const b=retrieveEvidence(query());
 assert.equal(b.status,'source_evidence');assert.equal(b.publisherId,pub);assert.equal(b.versionId,v);
 assert(b.included.some(x=>x.provisionId===ids[0]));
 assert(b.included.some(x=>x.provisionId===ids[2]));
 assert(b.exceptionMarkers.some(x=>x.sourceId===ids[0]));
 assert(b.included.every(x=>sha(x.text)===x.sha256&&x.start===0));
 assert.equal(b.publicationAllowed,false);
 assert.equal(b.configSha256.length,64);
 assert.equal(b.question,undefined);
});
test('unresolved references are explicit and never silently hallucinated',()=>{
 const changed=source.map(x=>({...x}));
 changed[2].text='Unknown Section 900 still controls.';
 const localIndex=buildSearchGeneration({publisherId:pub,versionId:v,sourceHash:sha('version-source-v1'),
  provisions:changed.map(p=>({publisherId:pub,versionId:v,provisionId:p.id,text:p.text,textSha256:sha(p.text)}))});
 const localGraph=buildRelationGraph({versionId:v,provisions:changed});
 const result=retrieveEvidence(query('Receipt',{index:localIndex,graph:localGraph}));
 assert(result.included.some(x=>x.provisionId===ids[2]));
 assert(result.unresolvedReferences.some(x=>x.citedSection==='900'));
});
test('nonexistent terms yield an honest no-evidence result, not a fallback guess',()=>{
 const b=retrieveEvidence(query('zzzzzxylophonemagic'));
 assert.equal(b.status,'no_evidence');assert.equal(b.included.length,0);
 assert.equal(b.publicationAllowed,false);
});
test('wrong tenant, stale version, age restrictions and current-law class all fail closed',()=>{
 assert.throws(()=>retrieveEvidence(query('Receipt',{route:{...routeFor('Receipt'),publisherId:'22222222-2222-4222-8222-222222222222'}})),e=>e.code==='CORPUS_SCOPE');
 assert.throws(()=>retrieveEvidence(query('Receipt',{route:{...routeFor('Receipt'),status:'curated_only'}})),e=>e.code==='RETRIEVAL_NOT_AUTHORIZED');
 assert.throws(()=>retrieveEvidence(query('Receipt',{route:{...routeFor('Receipt'),category:'current_law'}})),e=>e.code==='RETRIEVAL_NOT_AUTHORIZED');
 assert.throws(()=>retrieveEvidence(query('Receipt',{route:{...routeFor('Receipt'),versionId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}})),RetrievalError);
});
test('forged or altered text cannot pass the query-to-source consistency check',()=>{
 const corrupt={...graph,nodes:[{...graph.nodes[0],text:'Tampered contents',textHash:sha('Tampered contents')},...graph.nodes.slice(1)]};
 assert.throws(()=>retrieveEvidence(query('Receipt',{graph:corrupt})),e=>e.code==='INDEX_SOURCE_MISMATCH');
 assert.throws(()=>retrieveEvidence(query('Receipt',{question:'another prompt'})),e=>e.code==='RETRIEVAL_NOT_AUTHORIZED');
});
test('retrieval cap surfaces truncation and never creates unauthorized sources',()=>{
 const b=retrieveEvidence(query('Receipt',{maxSeeds:1,maxSources:1,depth:2}));
 assert.equal(b.included.length,1);assert.equal(b.truncated,true);
 assert.throws(()=>retrieveEvidence(query('Receipt',{maxSources:9999})),e=>e.code==='RETRIEVAL_BOUNDS');
});
test('result determinism and source selection do not use model-supplied coordinates',()=>{
 const a=retrieveEvidence(query()),b=retrieveEvidence(query());
 assert.deepEqual(a,b);
 assert(a.included.every(x=>!Object.hasOwn(x,'domSelector')&&!Object.hasOwn(x,'coordinates')));
});
