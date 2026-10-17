-- AB-004/024: validate the public catalog active-release query against ephemeral PostgreSQL schema.
\set ON_ERROR_STOP on
BEGIN;
PREPARE ask_bill_active_catalog(uuid,integer) AS
SELECT a.publisher_id,a.bill_id,v.id AS version_id,b.title,v.status
FROM ask_bill.release_active a
JOIN ask_bill.release_packs rp ON rp.publisher_id=a.publisher_id AND rp.bill_id=a.bill_id AND rp.id=a.release_id
JOIN ask_bill.bill_versions v ON v.publisher_id=rp.publisher_id AND v.bill_id=rp.bill_id AND v.id=rp.version_id
JOIN ask_bill.bills b ON b.publisher_id=v.publisher_id AND b.id=v.bill_id
JOIN ask_bill.search_active idx_active ON idx_active.publisher_id=v.publisher_id
 AND idx_active.version_id=v.id AND idx_active.generation_id=rp.generation_id
JOIN ask_bill.search_generations g ON g.publisher_id=idx_active.publisher_id
 AND g.version_id=idx_active.version_id AND g.id=idx_active.generation_id
WHERE a.publisher_id=$1::uuid AND v.publication='published'
 AND v.source_complete=true AND v.published_at IS NOT NULL
 AND rp.canonical_sha256=v.canonical_text_sha256
 AND g.status='complete' AND g.source_sha256=v.canonical_text_sha256
 AND EXISTS (SELECT 1 FROM ask_bill.source_import_events e
  JOIN ask_bill.source_objects obj ON obj.publisher_id=e.publisher_id AND obj.id=e.source_object_id
  WHERE e.publisher_id=v.publisher_id AND e.version_id=v.id AND obj.sha256=rp.original_sha256)
ORDER BY lower(b.title) COLLATE "C",b.id
LIMIT 21 OFFSET $2::integer;
EXPLAIN EXECUTE ask_bill_active_catalog('11111111-1111-4111-8111-111111111111',0);
DEALLOCATE ask_bill_active_catalog;
ROLLBACK;
