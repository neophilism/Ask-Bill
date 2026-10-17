/** Durable, publisher-scoped OIDC transaction/session persistence for PostgreSQL. */
import {createHash} from 'node:crypto';
import {AuthError} from './server.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEX=/^[a-f0-9]{64}$/;
const fail=code=>{throw new AuthError(code)};
const ms=value=>value instanceof Date?value.getTime():new Date(value).getTime();
export function publisherIdentityHash({issuer,subject}={}){
 if(typeof issuer!=='string'||issuer.length>2000||typeof subject!=='string'||subject.length<1||subject.length>255)fail('OIDC_IDENTITY_INVALID');
 return createHash('sha256').update(JSON.stringify([issuer,subject])).digest('hex');
}
export function createPostgresAuthStore({pool,publisherId}={}){
 if(!pool||typeof pool.connect!=='function'||!UUID.test(publisherId??''))fail('DURABLE_AUTH_STORE_REQUIRED');
 const publisher=publisherId.toLowerCase();
 async function transaction(request,fn){
  if(request?.publisherId!==publisher)fail('PUBLISHER_FORBIDDEN');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query("SELECT set_config('ask_bill.publisher_id', $1, true)",[publisher]);
   const result=await fn(client);await client.query('COMMIT');return result;
  }catch(error){try{await client.query('ROLLBACK')}catch{}throw error;}finally{client.release();}
 }
 const sessionHash=value=>{if(!HEX.test(value??''))fail('SESSION_INVALID');return value;};
 return Object.freeze({
  async saveLoginTransaction(input){
   return transaction(input,async client=>{
    await client.query('DELETE FROM ask_bill.publisher_login_transactions WHERE publisher_id=$1::uuid AND expires_at <= now()',[publisher]);
    // A publisher-wide bound complements the HTTP edge's caller rate limits.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[publisher+':oidc-logins']);
    const count=await client.query('SELECT count(*)::int AS count FROM ask_bill.publisher_login_transactions WHERE publisher_id=$1::uuid',[publisher]);
    if(Number(count.rows[0]?.count)>=512)fail('AUTH_RATE_LIMITED');
    await client.query(`INSERT INTO ask_bill.publisher_login_transactions
     (publisher_id,state_sha256,binding_sha256,nonce,pkce_verifier,return_path,require_mfa,created_at,expires_at,previous_session_sha256)
     VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[publisher,sessionHash(input.stateHash),sessionHash(input.bindingHash),input.nonce,input.verifier,input.returnTo,input.requireMfa,new Date(input.createdAt),new Date(input.expiresAt),input.previousSessionHash?sessionHash(input.previousSessionHash):null]);
   });
  },
  async consumeLoginTransaction(input){
   return transaction(input,async client=>{
    const result=await client.query(`DELETE FROM ask_bill.publisher_login_transactions
     WHERE publisher_id=$1::uuid AND state_sha256=$2 AND binding_sha256=$3 AND expires_at>$4 AND created_at<=$4
     RETURNING publisher_id,nonce,pkce_verifier,return_path,require_mfa,created_at,expires_at,previous_session_sha256`,[publisher,sessionHash(input.stateHash),sessionHash(input.bindingHash),new Date(input.now)]);
    if(result.rows.length!==1)return null;const row=result.rows[0];
    return {publisherId:row.publisher_id,nonce:row.nonce,verifier:row.pkce_verifier,returnTo:row.return_path,requireMfa:row.require_mfa,createdAt:ms(row.created_at),expiresAt:ms(row.expires_at),previousSessionHash:row.previous_session_sha256};
   });
  },
  async resolveIdentity(input){
   return transaction(input,async client=>{
    const result=await client.query(`SELECT i.user_id,m.role FROM ask_bill.publisher_auth_identities i
     JOIN ask_bill.publisher_memberships m ON m.publisher_id=i.publisher_id AND m.user_id=i.user_id
     WHERE i.publisher_id=$1::uuid AND i.identity_sha256=$2 AND i.disabled_at IS NULL`,[publisher,publisherIdentityHash(input)]);
    return result.rows.length===1?{userId:result.rows[0].user_id,role:result.rows[0].role}:null;
   });
  },
  async saveSession(input){
   return transaction(input,async client=>{
    if(!UUID.test(input.userId??''))fail('INVALID_ID');
    await client.query('DELETE FROM ask_bill.publisher_auth_sessions WHERE publisher_id=$1::uuid AND expires_at<=now()',[publisher]);
    await client.query(`INSERT INTO ask_bill.publisher_auth_sessions
     (publisher_id,session_sha256,user_id,csrf_sha256,issued_at,expires_at,mfa_verified_at,identity_sha256)
     VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8)`,[publisher,sessionHash(input.sessionHash),input.userId,sessionHash(input.csrfHash),new Date(input.issuedAt),new Date(input.expiresAt),input.mfaVerifiedAt===null?null:new Date(input.mfaVerifiedAt),sessionHash(input.identityHash)]);
   });
  },
  async getSession(input){
   return transaction(input,async client=>{
    const result=await client.query(`SELECT s.publisher_id,s.user_id,s.csrf_sha256,s.issued_at,s.expires_at,s.mfa_verified_at
     FROM ask_bill.publisher_auth_sessions s JOIN ask_bill.publisher_auth_identities i
     ON i.publisher_id=s.publisher_id AND i.identity_sha256=s.identity_sha256 AND i.user_id=s.user_id
     WHERE s.publisher_id=$1::uuid AND s.session_sha256=$2 AND i.disabled_at IS NULL`,[publisher,sessionHash(input.sessionHash)]);
    if(result.rows.length!==1)return null;const row=result.rows[0];
    return {publisherId:row.publisher_id,userId:row.user_id,csrfHash:row.csrf_sha256,issuedAt:ms(row.issued_at),expiresAt:ms(row.expires_at),mfaVerifiedAt:row.mfa_verified_at===null?null:ms(row.mfa_verified_at)};
   });
  },
  async deleteSession(input){
   return transaction(input,client=>client.query('DELETE FROM ask_bill.publisher_auth_sessions WHERE publisher_id=$1::uuid AND session_sha256=$2',[publisher,sessionHash(input.sessionHash)]));
  },
  async resolveMembership(input){
   if(!UUID.test(input.userId??''))return null;
   return transaction(input,async client=>{
    const result=await client.query(`SELECT m.role FROM ask_bill.publisher_memberships m
     WHERE m.publisher_id=$1::uuid AND m.user_id=$2::uuid AND EXISTS
     (SELECT 1 FROM ask_bill.publisher_auth_identities i WHERE i.publisher_id=m.publisher_id AND i.user_id=m.user_id AND i.disabled_at IS NULL)`,[publisher,input.userId]);
    return result.rows.length===1?result.rows[0].role:null;
   });
  }
 });
}
