/** AB-024 follow-up: active public-release catalog, using trusted tenant-bound read-only SQL. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES=new Set(['draft','introduced','amended','passed_one_chamber','enacted','effective','repealed','unknown']);
export class CatalogLookupError extends Error{constructor(code){super(code);this.code=code;this.name='CatalogLookupError';}}
const fail=c=>{throw new CatalogLookupError(c)};
export const ACTIVE_CATALOG_SQL=[
 'SELECT a.publisher_id,a.bill_id,v.id AS version_id,b.title,v.status',
 'FROM ask_bill.release_active a',
 'JOIN ask_bill.release_packs rp ON rp.publisher_id=a.publisher_id AND rp.bill_id=a.bill_id AND rp.id=a.release_id',
 'JOIN ask_bill.bill_versions v ON v.publisher_id=rp.publisher_id AND v.bill_id=rp.bill_id AND v.id=rp.version_id',
 'JOIN ask_bill.bills b ON b.publisher_id=v.publisher_id AND b.id=v.bill_id',
 'JOIN ask_bill.search_active idx_active ON idx_active.publisher_id=v.publisher_id',
 'AND idx_active.version_id=v.id AND idx_active.generation_id=rp.generation_id',
 'JOIN ask_bill.search_generations g ON g.publisher_id=idx_active.publisher_id',
 'AND g.version_id=idx_active.version_id AND g.id=idx_active.generation_id',
 'WHERE a.publisher_id=$1::uuid AND v.publication=\'published\'',
 'AND v.source_complete=true AND v.published_at IS NOT NULL',
 'AND rp.canonical_sha256=v.canonical_text_sha256',
 'AND g.status=\'complete\' AND g.source_sha256=v.canonical_text_sha256',
 'AND EXISTS (SELECT 1 FROM ask_bill.source_import_events e',
 'JOIN ask_bill.source_objects obj ON obj.publisher_id=e.publisher_id AND obj.id=e.source_object_id',
 'WHERE e.publisher_id=v.publisher_id AND e.version_id=v.id AND obj.sha256=rp.original_sha256)',
 'ORDER BY lower(b.title) COLLATE "C",b.id',
 'LIMIT 21 OFFSET $2::integer'
].join('\n');
export function createActiveCatalogLookup({pool,publisherId}={}){
 if(!pool||typeof pool.connect!=='function'||!UUID.test(publisherId??''))fail('TRUSTED_CATALOG_DATABASE_REQUIRED');
 const trusted=publisherId.toLowerCase();
 return async function lookup({publisherId:request,page=1}={}){
  if(request!==trusted||!Number.isSafeInteger(page)||page<1||page>50)fail('CATALOG_REQUEST_FORBIDDEN');
  let client;
  try{
   client=await pool.connect();
   if(!client||typeof client.query!=='function'||typeof client.release!=='function')fail('CATALOG_DATABASE_UNAVAILABLE');
   await client.query('BEGIN READ ONLY');
   await client.query("SELECT set_config('ask_bill.publisher_id', $1, true)",[trusted]);
   const result=await client.query(ACTIVE_CATALOG_SQL,[trusted,(page-1)*20]);
   if(!Array.isArray(result?.rows)||result.rows.length>21)fail('CATALOG_ROWS_INVALID');
   const rows=result.rows.slice(0,20);
   if(rows.some(row=>!row||row.publisher_id?.toLowerCase()!==trusted||
       !UUID.test(row.bill_id??'')||!UUID.test(row.version_id??'')||
       typeof row.title!=='string'||!row.title.trim()||row.title.length>300||
       !STATUSES.has(row.status)))fail('CATALOG_RECORD_INVALID');
   const items=rows.map(row=>Object.freeze({publisherId:trusted,billId:row.bill_id.toLowerCase(),
      versionId:row.version_id.toLowerCase(),title:row.title,status:row.status,
      publication:'published',sourceComplete:true}));
   await client.query('COMMIT');
   return Object.freeze({items:Object.freeze(items),hasNext:result.rows.length>20});
  }catch{
   if(client&&typeof client.query==='function')try{await client.query('ROLLBACK')}catch{}
   fail('CATALOG_DATABASE_UNAVAILABLE');
  }finally{if(client&&typeof client.release==='function')client.release();}
 };
}
