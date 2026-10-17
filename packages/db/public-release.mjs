/**
 * AB-024 follow-up: explicitly tenant-scoped public release lookup for the source reader.
 * Requires a non-owner, non-BYPASSRLS PostgreSQL pool configured by the backend.
 * No production connection or publisher is configured in this package.
 */
import {createHash} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^[a-f0-9]{64}$/;
const hash=t=>createHash('sha256').update(t,'utf8').digest('hex');
const iso=v=>v instanceof Date?v.toISOString():typeof v==='string'?v:null;
export class PublicReleaseLookupError extends Error{
 constructor(code){super(code);this.code=code;this.name='PublicReleaseLookupError';}
}
const fail=code=>{throw new PublicReleaseLookupError(code)};
export const ACTIVE_RELEASE_SQL=[
 'SELECT v.publisher_id, v.bill_id, v.id AS version_id, b.title, b.jurisdiction,',
 'v.language, v.status, v.retrieved_at, v.published_at, v.canonicalization_version,',
 'v.canonical_text_sha256',
 'FROM ask_bill.release_active active',
 'JOIN ask_bill.release_packs rp ON rp.publisher_id=active.publisher_id',
 'AND rp.bill_id=active.bill_id AND rp.id=active.release_id',
 'JOIN ask_bill.bill_versions v ON v.publisher_id=rp.publisher_id',
 'AND v.bill_id=rp.bill_id AND v.id=rp.version_id',
 'JOIN ask_bill.bills b ON b.publisher_id=v.publisher_id AND b.id=v.bill_id',
 'JOIN ask_bill.search_active idx_active ON idx_active.publisher_id=v.publisher_id',
 'AND idx_active.version_id=v.id AND idx_active.generation_id=rp.generation_id',
 'JOIN ask_bill.search_generations gen ON gen.publisher_id=idx_active.publisher_id',
 'AND gen.version_id=idx_active.version_id AND gen.id=idx_active.generation_id',
 'WHERE active.publisher_id=$1::uuid AND active.bill_id=$2::uuid',
 'AND v.id=$3::uuid AND v.publication=\'published\' AND v.source_complete=true',
 'AND v.published_at IS NOT NULL AND v.canonicalization_version=\'reader-canon-v1\'',
 'AND rp.canonical_sha256=v.canonical_text_sha256',
 'AND gen.status=\'complete\' AND gen.source_sha256=v.canonical_text_sha256',
 'AND EXISTS (SELECT 1 FROM ask_bill.source_import_events origin',
 'JOIN ask_bill.source_objects obj ON obj.publisher_id=origin.publisher_id',
 'AND obj.id=origin.source_object_id',
 'WHERE origin.publisher_id=v.publisher_id AND origin.version_id=v.id',
 'AND obj.sha256=rp.original_sha256)',
 'LIMIT 2'
].join('\n');
export const PUBLIC_PROVISIONS_SQL=[
 'SELECT id,provision_path,heading,canonical_text',
 'FROM ask_bill.provisions',
 'WHERE publisher_id=$1::uuid AND version_id=$2::uuid',
 'ORDER BY provision_path,id',
 'LIMIT 501'
].join('\n');
export function createActiveReleaseLookup({pool,publisherId}={}){
 if(!pool||typeof pool.connect!=='function'||!UUID.test(publisherId??''))fail('TRUSTED_DATABASE_CONFIGURATION_REQUIRED');
 const trustedPublisher=publisherId.toLowerCase();
 return async function lookupPublishedPack({publisherId:requested,billId,versionId}={}){
  if(!UUID.test(requested??'')||requested.toLowerCase()!==trustedPublisher||
     !UUID.test(billId??'')||!UUID.test(versionId??''))return null;
  let client;
  try{
   client=await pool.connect();
   if(!client||typeof client.query!=='function'||typeof client.release!=='function')return null;
   await client.query('BEGIN READ ONLY');
   await client.query("SELECT set_config('ask_bill.publisher_id', $1, true)",[trustedPublisher]);
   const active=await client.query(ACTIVE_RELEASE_SQL,[trustedPublisher,billId.toLowerCase(),versionId.toLowerCase()]);
   if(active?.rows?.length!==1){await client.query('ROLLBACK');return null;}
   const row=active.rows[0];
   if(!row||row.publisher_id?.toLowerCase()!==trustedPublisher||
     row.bill_id?.toLowerCase()!==billId.toLowerCase()||
     row.version_id?.toLowerCase()!==versionId.toLowerCase()||
     row.canonicalization_version!=='reader-canon-v1'||!DIGEST.test(row.canonical_text_sha256??'')){
     await client.query('ROLLBACK');return null;
   }
   const response=await client.query(PUBLIC_PROVISIONS_SQL,[trustedPublisher,versionId.toLowerCase()]);
   if(!Array.isArray(response?.rows)||response.rows.length<1||response.rows.length>500){
     await client.query('ROLLBACK');return null;
   }
   const provisions=response.rows.map(section=>({
     id:'s'+String(section.id??'').replace(/-/g,'').toLowerCase(),
     heading:section.heading?.trim()||section.provision_path,
     text:section.canonical_text,
     sha256:typeof section.canonical_text==='string'?hash(section.canonical_text):''
   }));
   if(provisions.some(s=>!/^s[a-f0-9]{32}$/.test(s.id)||typeof s.heading!=='string')||
      hash(provisions.map(p=>p.text).join('\n\n'))!==row.canonical_text_sha256){
     await client.query('ROLLBACK');return null;
   }
   const pack={
     schema:'ask-bill-reader-v1',canonicalizationVersion:'reader-canon-v1',
     publisherId:trustedPublisher,billId:billId.toLowerCase(),versionId:versionId.toLowerCase(),
     title:row.title,jurisdiction:row.jurisdiction,language:row.language,status:row.status,
     publication:'published',sourceComplete:true,
     retrievedAt:iso(row.retrieved_at),publishedAt:iso(row.published_at),
     canonicalSha256:row.canonical_text_sha256,provisions
   };
   await client.query('COMMIT');
   return pack;
  }catch{
   if(client&&typeof client.query==='function')try{await client.query('ROLLBACK')}catch{}
   return null;
  }finally{
   if(client&&typeof client.release==='function')client.release();
  }
 };
}
