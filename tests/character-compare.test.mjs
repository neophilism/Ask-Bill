import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPreviewServer } from '../apps/web/preview/server.mjs';
import { MAX_SHORTLIST, safeRoster, normalizeShortlist, toggleShortlist, feedbackJson } from '../packages/character/gallery/shortlist.mjs';

const manifest=JSON.parse(await readFile(new URL('../assets/bill/characters/dist/manifest.json',import.meta.url)));
const members=safeRoster(manifest),ids=members.map(x=>x.id);

test('shortlist accepts only distinct known catalog IDs and caps at seven',()=>{
  assert.equal(MAX_SHORTLIST,7);
  const input=[...ids,'bill-01','bill-01',{},null,'bill-99'];
  assert.deepEqual(normalizeShortlist(input,ids),ids.slice(0,7));
  const added=toggleShortlist([], 'bill-10', ids);
  assert.deepEqual(added.list,['bill-10']);
  assert.deepEqual(toggleShortlist(added.list,'bill-10',ids).list,[]);
  const tooMany=toggleShortlist(ids.slice(0,7),'bill-10',ids);
  assert.match(tooMany.error,/seven/);assert.equal(tooMany.list.length,7);
  assert.match(toggleShortlist([], '__proto__',ids).error,/Unknown/);
});
test('saved local feedback is public character metadata only',()=>{
  const data=JSON.parse(feedbackJson(['bill-10','bill-12'],members,'bill-12'));
  assert.deepEqual(data.shortlist,['bill-10','bill-12']);
  assert.equal(data.chosenCharacter,'bill-12');
  assert.equal(data.candidates.length,2);
  assert.equal(data.schemaVersion,1);
  assert.doesNotMatch(JSON.stringify(data),/email|demographic|race|religion|gender|microphone|userId|questionText/i);
});
test('reject corrupted or misleading roster and invalid identifiers',()=>{
  assert.throws(()=>safeRoster({characters:[]}),/20/);
  assert.throws(()=>safeRoster({...manifest,default:'bill-01'}),/default/);
  assert.throws(()=>safeRoster({...manifest,characters:[...members.slice(0,19),members[0]]}),/Invalid/);
  assert.deepEqual(normalizeShortlist({length:1000},ids),[]);
});
async function withPreview(callback){
  const server=await createPreviewServer();
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const uri='http://127.0.0.1:'+server.address().port;
  try{return await callback(uri)}finally{await new Promise((ok,bad)=>server.close(err=>err?bad(err):ok()))}
}
test('comparison page serves real interactive viewer and safe local assets',async()=>{
  await withPreview(async uri=>{
    for(const path of ['/compare.html']){
      const r=await fetch(uri+path);assert.equal(r.status,200,path);
      assert.match(r.headers.get('content-security-policy'),/cdn\.jsdelivr\.net/);
      const html=await r.text();
      assert.match(html,/Bill Walk-off Lab/);
      assert.equal((html.match(/<model-viewer\b/g)||[]).length,3);
      assert.match(html,/shortlist/);
      assert.doesNotMatch(html,/onload=|onclick=/i);
    }
    for(const path of ['/compare.js','/compare.css','/packages/character/gallery/shortlist.mjs']){
      const r=await fetch(uri+path);assert.equal(r.status,200,path);
      assert.ok((await r.text()).length>400);
    }
    assert.equal((await fetch(uri+'/assets/bill/characters/reference/original-10.jpg')).headers.get('content-type'),'image/jpeg');
    for(const bad of ['/assets/bill/characters/reference/original-00.jpg',
     '/assets/bill/characters/reference/original-11.jpg',
     '/assets/bill/characters/reference/../../../AGENTS.md']){
      assert.equal((await fetch(uri+bad)).status,404,bad);
    }
    const old=await fetch(uri+'/characters');
    assert.match(await old.text(),/Compare three walking Bills/);
    const normal=await fetch(uri+'/preview');
    assert.doesNotMatch(normal.headers.get('content-security-policy')||'',/cdn\.jsdelivr\.net/);
  });
});
