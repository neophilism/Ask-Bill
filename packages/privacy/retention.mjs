/** AB-095: bounded server-only expired session cleanup. No daemon starts here. */
export class RetentionError extends Error{constructor(code){super(code);this.code=code;this.name='RetentionError';}}
const deny=code=>{throw new RetentionError(code)};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function publisherId(value){if(typeof value!=='string'||!UUID.test(value))deny('INVALID_PUBLISHER');return value.toLowerCase();}
export function createExpiredSessionCleaner({pool,trustedPublisherId,now=()=>Date.now()}={}){
 const publisher=publisherId(trustedPublisherId);
 if(!pool||typeof pool.connect!=='function')deny('TRUSTED_POOL_REQUIRED');
 if(typeof now!=='function')deny('CLOCK_REQUIRED');
 return Object.freeze({
   async clean({publisherId:requestedPublisher=publisher,cutoff=new Date(now()),limit=50}={}){
     if(publisherId(requestedPublisher)!==publisher)deny('PUBLISHER_FORBIDDEN');
     if(!(cutoff instanceof Date)||!Number.isFinite(cutoff.getTime())||
        !Number.isSafeInteger(limit)||limit<1||limit>100)deny('INVALID_RETENTION_REQUEST');
     const timestamp=now();
     if(!Number.isFinite(timestamp)||cutoff.getTime()>timestamp)deny('FUTURE_CUTOFF_FORBIDDEN');
     const client=await pool.connect();
     if(!client||typeof client.query!=='function'||typeof client.release!=='function')deny('CLIENT_REQUIRED');
     try{
       await client.query('BEGIN');
       await client.query("SELECT set_config('ask_bill.publisher_id',$1,true)",[publisher]);
       const result=await client.query('SELECT * FROM ask_bill.expire_session_data($1::uuid,$2::timestamptz,$3::integer)',
         [publisher,cutoff.toISOString(),limit]);
       const row=result.rows?.[0];
       const sessions=Number(row?.sessions_removed),reservations=Number(row?.reservations_removed);
       if(!Number.isSafeInteger(sessions)||sessions<0||sessions>limit||
          !Number.isSafeInteger(reservations)||reservations<0||reservations>100000)
         deny('DATABASE_COUNT_INVALID');
       await client.query('COMMIT');
       return Object.freeze({publisherId:publisher,sessionsRemoved:sessions,
          reservationsRemoved:reservations,moreBatchesMayRemain:sessions===limit});
     }catch(error){
       try{await client.query('ROLLBACK');}catch{ /* preserve original failure */ }
       throw error;
     }finally{client.release();}
   }
 });
}
