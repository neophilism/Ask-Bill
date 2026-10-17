import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {previewAmendments,AmendmentError} from '../packages/content/amendments/index.mjs';
const old='v1',next='v2',sha=t=>createHash('sha256').update(t).digest('hex');
const p=(id,text)=>({id,versionId:old,text});
const fixture=[p('sec1','A 😃 bill shall take effect.'),p('sec2','Exceptions apply when authorized.')];
const op=(kind,id,start,end,newText,opts={})=>{
 const base=fixture.find(x=>x.id===id),text=Array.from(base.text).slice(start,end).join('');
 const o={kind,versionId:old,provisionId:id,start,end,expectedOriginal:text,expectedQuoteHash:sha(text),...opts};
 if(['insert','replace'].includes(kind))o.newText=newText;
 return o;
};
const apply=operations=>previewAmendments({sourceVersionId:old,computedVersionId:next,provisions:fixture,operations});
test('exact Unicode insert, strike and replace yield computed-only diff',()=>{
 const a=op('replace','sec1',2,3,'📜');
 const b=op('insert','sec1',0,0,'Proposed: ',{rightContext:'A'});
 const r=apply([a,b]);
 assert.equal(r.status,'computed_preview');assert.equal(r.authoritative,false);assert.equal(r.publicationAllowed,false);
 assert.equal(r.provisions[0].text,'Proposed: A 📜 bill shall take effect.');
 assert.equal(r.provisions[1].text,fixture[1].text);assert.equal(r.resultHash.length,64);
 assert.equal(fixture[0].text,'A 😃 bill shall take effect.');
});
test('multiple disjoint strike/replace remain source-offset safe',()=>{
 const original=fixture[1].text;
 const first=op('strike','sec2',0,11);
 const last=op('replace','sec2',22,32,'permitted');
 const r=apply([first,last]);assert.equal(r.status,'computed_preview');
 assert.equal(r.provisions[1].text,Array.from(original).slice(11,22).join('')+'permitted'+Array.from(original).slice(32).join(''));
});
test('repeal requires full source and returns explicit repealed status',()=>{
 const len=Array.from(fixture[0].text).length;
 const x=apply([op('repeal','sec1',0,len)]);
 assert.equal(x.status,'computed_preview');assert.equal(x.provisions[0].repealed,true);assert.equal(x.provisions[0].text,'');
 const partial=apply([op('repeal','sec1',0,1)]);assert.equal(partial.status,'blocked');
});
test('redesignation preserves source text, warns on collision',()=>{
 const len=Array.from(fixture[0].text).length;
 const r=apply([op('redesignate','sec1',0,len,undefined,{newProvisionId:'new-sec1'})]);
 assert.equal(r.status,'computed_preview');assert.equal(r.provisions[0].id,'new-sec1');assert.equal(r.provisions[0].text,fixture[0].text);
 const bad=apply([op('redesignate','sec1',0,len,undefined,{newProvisionId:'sec2'})]);
 assert.equal(bad.status,'blocked');assert(bad.conflicts.some(x=>x.code==='REDESIGNATE_COLLISION'));
});
test('overlapping and mixed structural operations cannot produce combined authoritative text',()=>{
 const a=apply([op('replace','sec1',0,4,'Text'),op('strike','sec1',1,5)]);
 assert.equal(a.status,'blocked');assert.equal(a.provisions,null);assert(a.conflicts.some(x=>x.code==='OVERLAPPING_OPERATIONS'));
 const len=Array.from(fixture[0].text).length;
 const b=apply([op('repeal','sec1',0,len),op('insert','sec1',0,0,'a',{rightContext:'A'})]);
 assert.equal(b.status,'blocked');assert(b.conflicts.some(x=>x.code==='STRUCTURAL_COLLISION'));
});
test('stale source span hash or different source version never silently amends',()=>{
 const change=op('replace','sec1',2,3,'x');
 const a=apply([{...change,expectedQuoteHash:'0'.repeat(64)}]);
 assert.equal(a.status,'blocked');assert(a.conflicts.some(x=>x.code==='SOURCE_QUOTE_MISMATCH'));
 const b=apply([{...change,versionId:'other'}]);assert.equal(b.status,'blocked');
 assert.throws(()=>previewAmendments({sourceVersionId:old,computedVersionId:old,provisions:fixture,operations:[change]}),e=>e.code==='AMENDMENT_INPUT');
 assert.throws(()=>apply([op('replace','sec404',0,1,'x')]),e=>e.code==='UNKNOWN_PROVISION'||e.name==='TypeError');
});
test('conflicting insertions at same source point are never chosen arbitrarily',()=>{
 const a=op('insert','sec1',2,2,'first',{leftContext:'A ',rightContext:'😃'});
 const b=op('insert','sec1',2,2,'second',{leftContext:'A ',rightContext:'😃'});
 const r=apply([a,b]);assert.equal(r.status,'blocked');
});
test('explicit new version never overrides original or legal status',()=>{
 const a=apply([op('replace','sec2',0,10,'New')]);
 assert(a.provisions.every(x=>x.computed&&x.sourceVersionId===old&&x.computedVersionId===next));
 assert.equal(a.authoritative,false);assert.equal(a.publicationAllowed,false);
});
