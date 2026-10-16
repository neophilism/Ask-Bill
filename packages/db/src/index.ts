/** AB-007: parameterized tenant-aware query contracts. No database client or credentials. */
export type SqlQuery = Readonly<{ sql: string; params: readonly string[] }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class DatabaseContractError extends Error {
  constructor(message: string) { super(message); this.name = 'DatabaseContractError'; }
}
function uuid(value: string, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new DatabaseContractError(`Invalid ${field}`);
  return value.toLowerCase();
}
function query(sql: string, params: string[]): SqlQuery {
  return Object.freeze({sql, params:Object.freeze(params)});
}
/** API must verify membership and roles before setting this transaction-local context. */
export function trustedTenantContext(publisherId: string): SqlQuery {
  return query("SELECT set_config('ask_bill.publisher_id', $1, true)",[uuid(publisherId,'publisherId')]);
}
/** Never expose unpublished or incomplete versions on the public route. */
export function publishedVersionById(publisherId: string, versionId: string): SqlQuery {
  return query(`SELECT id, bill_id, status, language, raw_byte_sha256, canonical_text_sha256, canonicalization_version, published_at
FROM ask_bill.bill_versions
WHERE publisher_id=$1::uuid AND id=$2::uuid AND publication='published' AND source_complete=true AND published_at IS NOT NULL`,
    [uuid(publisherId,'publisherId'),uuid(versionId,'versionId')]);
}
/** Scoped private source queries still require a trusted server transaction and RLS. */
export function privateBillById(publisherId: string, billId: string): SqlQuery {
  return query('SELECT id, publisher_id, title, jurisdiction, created_at FROM ask_bill.bills WHERE publisher_id=$1::uuid AND id=$2::uuid',
    [uuid(publisherId,'publisherId'),uuid(billId,'billId')]);
}
export function provisionsByVersion(publisherId: string, versionId: string): SqlQuery {
  return query('SELECT id, provision_path, heading, canonical_text, original_locator FROM ask_bill.provisions WHERE publisher_id=$1::uuid AND version_id=$2::uuid ORDER BY provision_path',
    [uuid(publisherId,'publisherId'),uuid(versionId,'versionId')]);
}
export function sessionDeleteByCapability(publisherId: string, sessionId: string, tokenHash: string): SqlQuery {
  if(typeof tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(tokenHash))throw new DatabaseContractError('Invalid capability digest');
  return query('DELETE FROM ask_bill.sessions WHERE publisher_id=$1::uuid AND id=$2::uuid AND capability_sha256=$3 RETURNING id',
    [uuid(publisherId,'publisherId'),uuid(sessionId,'sessionId'),tokenHash]);
}
