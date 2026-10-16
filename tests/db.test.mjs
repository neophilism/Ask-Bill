import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseContractError,publishedVersionById,privateBillById,provisionsByVersion,sessionDeleteByCapability,trustedTenantContext} from '../packages/db/dist/index.js';
const sql=await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8');
const tenant1='11111111-1111-4111-8111-111111111111';
const tenant2='22222222-2222-4222-8222-222222222222';
const hash='f'.repeat(64);
test('initial schema is transactional, additive, repeatable in structure, and preserves provenance',()=>{
 assert.match(sql,/^-- Ask Bill independent/m);
 assert.match(sql,/\bBEGIN;/);assert.match(sql,/COMMIT;\s*$/);
 assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|SCHEMA|COLUMN)\b/i);
 assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS ask_bill\./g)||[]).length,10);
 for(const table of ['publishers','publisher_memberships','bills','bill_versions','provisions','sessions','jobs','outbox_events','usage_reservations','audit_events']){
  assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ask_bill\\.${table}\\s*\\(`));
  assert.match(sql,new RegExp(`ALTER TABLE ask_bill\\.${table} ENABLE ROW LEVEL SECURITY;`));
  assert.match(sql,new RegExp(`ALTER TABLE ask_bill\\.${table} FORCE ROW LEVEL SECURITY;`));
 }
 assert.match(sql,/CREATE POLICY publisher_scope/);
 assert.match(sql,/IF NOT EXISTS \(SELECT 1 FROM pg_policies/);
 assert.match(sql,/FOREIGN KEY \(publisher_id, bill_id\)/);
 assert.match(sql,/FOREIGN KEY \(publisher_id, version_id\)/);
 assert.match(sql,/FOREIGN KEY \(publisher_id, session_id\)/);
 assert.match(sql,/CHECK \(publication <> 'published' OR \(source_complete AND published_at IS NOT NULL\)\)/);
 assert.match(sql,/CREATE INDEX IF NOT EXISTS expired_sessions/);
 assert.match(sql,/CREATE INDEX IF NOT EXISTS audit_by_publisher/);
});
test('publisher context is transaction-local and all queries require scoped bound UUID arguments',()=>{
 const ctx=trustedTenantContext(tenant1);
 assert.match(ctx.sql,/set_config\('ask_bill\.publisher_id', \$1, true\)/);
 assert.deepEqual(ctx.params,[tenant1]);assert(Object.isFrozen(ctx.params));
 for(const q of [publishedVersionById(tenant1,tenant2),privateBillById(tenant1,tenant2),provisionsByVersion(tenant1,tenant2),sessionDeleteByCapability(tenant1,tenant2,hash)]){
  assert.match(q.sql,/publisher_id=\$1::uuid/);
  assert(!q.sql.includes(tenant1));assert(!q.sql.includes(tenant2));
  assert.equal(q.params[0],tenant1);
  assert(Object.isFrozen(q));
 }
 assert.match(publishedVersionById(tenant1,tenant2).sql,/publication='published' AND source_complete=true/);
 assert.match(sessionDeleteByCapability(tenant1,tenant2,hash).sql,/capability_sha256=\$3/);
});
test('injection strings and guessed cross-tenant identifiers never become SQL',()=>{
 for(const bad of ['','not-a-uuid',"'; DROP TABLE ask_bill.bills; --",tenant1+'-extra',null,{},12]){
  assert.throws(()=>trustedTenantContext(bad),DatabaseContractError);
  assert.throws(()=>privateBillById(tenant1,bad),DatabaseContractError);
 }
 assert.throws(()=>sessionDeleteByCapability(tenant1,tenant2,'a'.repeat(63)),DatabaseContractError);
 assert.throws(()=>sessionDeleteByCapability(tenant1,tenant2,"';--"),DatabaseContractError);
 assert.notDeepEqual(privateBillById(tenant1,tenant2).params,privateBillById(tenant2,tenant1).params);
});
