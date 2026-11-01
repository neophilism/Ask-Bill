import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {snapshotTourSteps} from '../packages/content/releases/tour-selection.mjs';
import {loadPublishedTourSteps,PUBLIC_TOUR_MANIFEST_SQL,PUBLIC_TOUR_PACK_SQL} from '../packages/db/public-tour.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
const id='11111111-1111-4111-8111-111111111111',publicId='s'+id.replaceAll('-','');
const sourceHash='a'.repeat(64);
const publicPack={publisherId:'publisher',billId:'bill',versionId:'version',canonicalSha256:sourceHash,provisions:[{id:publicId}]};
function fixture({steps=[publicId],changePack={},changeManifest={}}={}){
 const raw=Buffer.from(JSON.stringify({...publicPack,tourStepIds:steps,...changePack}));
 const manifest={publisherId:publicPack.publisherId,billId:publicPack.billId,versionId:publicPack.versionId,
  canonicalSha256:sourceHash,objects:[{sha256:digest(raw),bytes:raw.length}],...changeManifest};
 const bytes=Buffer.from(JSON.stringify(manifest));
 const calls=[];
 return {calls,raw,bytes,client:{async query(sql,params){
  calls.push({sql,params});
  if(sql===PUBLIC_TOUR_MANIFEST_SQL)return {rows:[{pack_bytes:bytes,manifest_sha256:digest(bytes)}]};
  if(sql===PUBLIC_TOUR_PACK_SQL)return {rows:[{pack_bytes:raw}]};
  throw Error('unexpected query');
 }}};
}
test('private selection snapshots contain only current verified public source IDs',()=>{
 const context={canonicalSha256:sourceHash,provisions:[{id}]};
 const draft={source_sha256:sourceHash,step_ids:[id],privateNote:'never published'};
 const result=snapshotTourSteps(draft,context);
 assert.deepEqual(result,[publicId]);assert.ok(Object.isFrozen(result));
 draft.step_ids[0]='other';assert.deepEqual(result,[publicId]);
 for(const bad of [{...draft,step_ids:[id,id]},{...draft,step_ids:['other']},
  {...draft,source_sha256:'b'.repeat(64),step_ids:[id]},{...draft,step_ids:Array(1)}]){
  assert.throws(()=>snapshotTourSteps(bad,context),/TOUR_SOURCE_INVALID/);
 }
 assert.equal(snapshotTourSteps(undefined,context),undefined);
});
test('published selection requires both manifest and source-pack hash and scope binding',async()=>{
 const f=fixture();
 assert.deepEqual(await loadPublishedTourSteps(f.client,publicPack),[publicId]);
 assert.deepEqual(f.calls[0].params,['publisher','bill','version']);
 assert.equal(f.calls[1].params[0],'publisher');
 for(const changePack of [{publisherId:'other'},{billId:'other'},{versionId:'other'},{canonicalSha256:'b'.repeat(64)}]){
  const changed=fixture({changePack});
  assert.equal(await loadPublishedTourSteps(changed.client,publicPack),undefined);
 }
 for(const changeManifest of [{publisherId:'other'},{canonicalSha256:'b'.repeat(64)}]){
  const changed=fixture({changeManifest});
  assert.equal(await loadPublishedTourSteps(changed.client,publicPack),undefined);
 }
});
test('corrupt, foreign or duplicate tour metadata cannot suppress verified source reading',async()=>{
 for(const steps of [[],['foreign'],[publicId,publicId],Array(1)]){
  const f=fixture({steps});
  assert.equal(await loadPublishedTourSteps(f.client,publicPack),undefined);
 }
 const f=fixture();
 const tampered={async query(sql,params){
  const result=await f.client.query(sql,params);
  if(sql===PUBLIC_TOUR_PACK_SQL)result.rows[0].pack_bytes=Buffer.from('tampered');
  return result;
 }};
 assert.equal(await loadPublishedTourSteps(tampered,publicPack),undefined);
 assert.equal(await loadPublishedTourSteps({async query(){return {rows:[]};}},publicPack),undefined);
 assert.equal(await loadPublishedTourSteps({async query(){throw Error('unavailable');}},publicPack),undefined);
});
