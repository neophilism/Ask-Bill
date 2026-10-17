-- AB-004/024: prepare and execute the same active-published-source query on PostgreSQL 17.
-- This validates joins/columns against real migrations; the ephemeral fixture has no
-- active release because the previous publishing acceptance test rolls back.
\set ON_ERROR_STOP on
BEGIN;
PREPARE ask_bill_public_reader(uuid,uuid,uuid) AS
SELECT v.publisher_id, v.bill_id, v.id AS version_id, b.title, b.jurisdiction,
       v.language, v.status, v.retrieved_at, v.published_at,
       v.canonicalization_version, v.canonical_text_sha256
FROM ask_bill.release_active active
JOIN ask_bill.release_packs rp ON rp.publisher_id=active.publisher_id
 AND rp.bill_id=active.bill_id AND rp.id=active.release_id
JOIN ask_bill.bill_versions v ON v.publisher_id=rp.publisher_id
 AND v.bill_id=rp.bill_id AND v.id=rp.version_id
JOIN ask_bill.bills b ON b.publisher_id=v.publisher_id AND b.id=v.bill_id
JOIN ask_bill.search_active idx_active ON idx_active.publisher_id=v.publisher_id
 AND idx_active.version_id=v.id AND idx_active.generation_id=rp.generation_id
JOIN ask_bill.search_generations gen ON gen.publisher_id=idx_active.publisher_id
 AND gen.version_id=idx_active.version_id AND gen.id=idx_active.generation_id
WHERE active.publisher_id=$1::uuid AND active.bill_id=$2::uuid
 AND v.id=$3::uuid AND v.publication='published' AND v.source_complete=true
 AND v.published_at IS NOT NULL AND v.canonicalization_version='reader-canon-v1'
 AND rp.canonical_sha256=v.canonical_text_sha256
 AND gen.status='complete' AND gen.source_sha256=v.canonical_text_sha256
 AND EXISTS (SELECT 1 FROM ask_bill.source_import_events origin
  JOIN ask_bill.source_objects obj ON obj.publisher_id=origin.publisher_id
   AND obj.id=origin.source_object_id
  WHERE origin.publisher_id=v.publisher_id AND origin.version_id=v.id
   AND obj.sha256=rp.original_sha256)
 LIMIT 2;
EXPLAIN EXECUTE ask_bill_public_reader('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa');
DEALLOCATE ask_bill_public_reader;
ROLLBACK;
