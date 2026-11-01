/** Read only immutable, hash-bound published metadata; never read private tour drafts. */
import {createHash} from 'node:crypto';
import {validatedPublishedTourSteps} from '../content/releases/tour-selection.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const HEX=/^[a-f0-9]{64}$/;
export const PUBLIC_TOUR_MANIFEST_SQL=`
 SELECT p.pack_bytes,rp.manifest_sha256 FROM ask_bill.release_active a
 JOIN ask_bill.release_packs rp ON rp.publisher_id=a.publisher_id AND rp.bill_id=a.bill_id AND rp.id=a.release_id
 JOIN ask_bill.publisher_public_packs p ON p.publisher_id=rp.publisher_id AND p.version_id=rp.version_id AND p.sha256=rp.manifest_sha256
 WHERE rp.publisher_id=$1::uuid AND rp.bill_id=$2::uuid AND rp.version_id=$3::uuid
 AND octet_length(p.pack_bytes)<=65536 LIMIT 2`;
export const PUBLIC_TOUR_PACK_SQL=`
 SELECT pack_bytes FROM ask_bill.publisher_public_packs
 WHERE publisher_id=$1::uuid AND version_id=$2::uuid AND sha256=$3
 AND octet_length(pack_bytes)<=10000000 LIMIT 2`;
export async function loadPublishedTourSteps(client,pack){
 // Optional curation must never make independently verified source reading unavailable.
 try{
  const rows=(await client.query(PUBLIC_TOUR_MANIFEST_SQL,[pack.publisherId,pack.billId,pack.versionId])).rows;
  if(rows?.length!==1)return undefined;
  const row=rows[0],bytes=row.pack_bytes;
  if(!Buffer.isBuffer(bytes)||!HEX.test(row.manifest_sha256)||digest(bytes)!==row.manifest_sha256)return undefined;
  const manifest=JSON.parse(bytes.toString('utf8'));
  if(manifest.publisherId!==pack.publisherId||manifest.billId!==pack.billId||manifest.versionId!==pack.versionId||
     manifest.canonicalSha256!==pack.canonicalSha256||!Array.isArray(manifest.objects)||manifest.objects.length!==1||
     !HEX.test(manifest.objects[0]?.sha256))return undefined;
  const objects=(await client.query(PUBLIC_TOUR_PACK_SQL,[pack.publisherId,pack.versionId,manifest.objects[0].sha256])).rows;
  if(objects?.length!==1||!Buffer.isBuffer(objects[0].pack_bytes))return undefined;
  const raw=objects[0].pack_bytes;
  if(raw.length!==manifest.objects[0].bytes||digest(raw)!==manifest.objects[0].sha256)return undefined;
  const stored=JSON.parse(raw.toString('utf8'));
  if(stored.publisherId!==pack.publisherId||stored.billId!==pack.billId||stored.versionId!==pack.versionId||
     stored.canonicalSha256!==pack.canonicalSha256)return undefined;
  return validatedPublishedTourSteps(stored.tourStepIds,pack.provisions);
 }catch{return undefined;}
}
