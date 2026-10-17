-- AB-024: preflight count/UTF-8 byte-size without loading source text into Node.
\set ON_ERROR_STOP on
BEGIN;
PREPARE ask_bill_public_size(uuid,uuid) AS
SELECT count(*)::bigint AS provision_count,
       COALESCE(sum(octet_length(canonical_text)),0)::bigint AS total_bytes
FROM ask_bill.provisions
WHERE publisher_id=$1::uuid AND version_id=$2::uuid;
EXPLAIN EXECUTE ask_bill_public_size('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa');
DEALLOCATE ask_bill_public_size;
ROLLBACK;
