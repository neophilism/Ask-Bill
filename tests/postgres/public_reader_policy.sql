-- AB-024: real PostgreSQL read-only public-release integration under FORCE RLS.
-- Only synthetic records are created; every mutation is rolled back.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $setup$
DECLARE
 pub uuid:='11111111-1111-4111-8111-111111111111';
 bill uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 version uuid:='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
 reviewer uuid:='33333333-3333-4333-8333-333333333333';
 entry_id uuid;
 generation uuid;
 release_id uuid;
 txt text;
 digest text;
BEGIN
 SELECT id,canonical_text INTO entry_id,txt FROM ask_bill.provisions
 WHERE publisher_id=pub AND version_id=version LIMIT 1;
 IF entry_id IS NULL THEN RAISE EXCEPTION 'The canonical test provision is missing'; END IF;
 digest:=encode(sha256(convert_to(txt,'UTF8')),'hex');
 UPDATE ask_bill.bill_versions SET source_complete=true,publication='reviewed',
  canonicalization_version='reader-canon-v1',canonical_text_sha256=digest
 WHERE publisher_id=pub AND bill_id=bill AND id=version;
 INSERT INTO ask_bill.search_generations(publisher_id,version_id,source_sha256,index_sha256,expected_entries)
 VALUES(pub,version,digest,repeat('e',64),1) RETURNING id INTO generation;
 INSERT INTO ask_bill.search_entries(publisher_id,version_id,generation_id,provision_id,canonical_text,text_sha256)
 VALUES(pub,version,generation,entry_id,txt,digest);
 UPDATE ask_bill.search_generations SET status='complete'
 WHERE publisher_id=pub AND version_id=version AND id=generation;
 IF NOT ask_bill.activate_search_generation(pub,version,generation,NULL)
  THEN RAISE EXCEPTION 'Index activation failed'; END IF;
 INSERT INTO ask_bill.release_packs(publisher_id,bill_id,version_id,generation_id,
  original_sha256,canonical_sha256,manifest_sha256,review_sha256,reviewed_by)
 VALUES(pub,bill,version,generation,repeat('a',64),digest,repeat('b',64),repeat('c',64),reviewer)
 RETURNING id INTO release_id;
 IF NOT ask_bill.activate_reviewed_release(pub,bill,release_id,NULL,reviewer)
  THEN RAISE EXCEPTION 'Publishing failed for a reviewed synthetic version'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ask_bill.release_active WHERE publisher_id=pub AND bill_id=bill AND release_id IS NOT NULL)
  THEN RAISE EXCEPTION 'A valid release did not activate'; END IF;
END $setup$;

-- This is the same predicate/relationships as ACTIVE_RELEASE_SQL from the
-- server module, executed via a SECURITY INVOKER function under the runtime role.
CREATE FUNCTION pg_temp.reader_count(p_publisher uuid,p_bill uuid,p_version uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER AS $lookup$
 SELECT count(*)::integer
 FROM ask_bill.release_active active
 JOIN ask_bill.release_packs rp ON rp.publisher_id=active.publisher_id
  AND rp.bill_id=active.bill_id AND rp.id=active.release_id
 JOIN ask_bill.bill_versions v ON v.publisher_id=rp.publisher_id
  AND v.bill_id=rp.bill_id AND v.id=rp.version_id
 JOIN ask_bill.bills b ON b.publisher_id=v.publisher_id AND b.id=v.bill_id
 JOIN ask_bill.search_active idx_active ON idx_active.publisher_id=v.publisher_id
  AND idx_active.version_id=v.id AND idx_active.generation_id=rp.generation_id
 JOIN ask_bill.search_generations g ON g.publisher_id=idx_active.publisher_id
  AND g.version_id=idx_active.version_id AND g.id=idx_active.generation_id
 WHERE active.publisher_id=p_publisher AND active.bill_id=p_bill AND v.id=p_version
  AND v.publication='published' AND v.source_complete=true
  AND v.published_at IS NOT NULL AND v.canonicalization_version='reader-canon-v1'
  AND rp.canonical_sha256=v.canonical_text_sha256
  AND g.status='complete' AND g.source_sha256=v.canonical_text_sha256
  AND EXISTS (
   SELECT 1 FROM ask_bill.source_import_events src
   JOIN ask_bill.source_objects obj ON obj.publisher_id=src.publisher_id AND obj.id=src.source_object_id
   WHERE src.publisher_id=v.publisher_id AND src.version_id=v.id AND obj.sha256=rp.original_sha256
  )
$lookup$;

SAVEPOINT unprivileged_reader;
SET LOCAL ROLE ask_bill_test_reader;
DO $role_guard$
BEGIN
 IF (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'Fixture role must have no superuser/BYPASSRLS privilege'; END IF;
END $role_guard$;
-- No authenticated tenant context must return no records.
SELECT set_config('ask_bill.publisher_id','',true);
DO $missing$
BEGIN
 IF pg_temp.reader_count('11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa')<>0
  THEN RAISE EXCEPTION 'Published release leaked without a publisher context'; END IF;
END $missing$;
-- Publisher 1 sees only their own currently active version.
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $allowed$
BEGIN
 IF pg_temp.reader_count('11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa')<>1
  THEN RAISE EXCEPTION 'An authorized published release was not readable'; END IF;
 IF pg_temp.reader_count('11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb')<>0
  THEN RAISE EXCEPTION 'Wrong version leaked a public release'; END IF;
END $allowed$;
-- Publisher 2 cannot read a guessed publisher-1 release ID.
SELECT set_config('ask_bill.publisher_id','22222222-2222-4222-8222-222222222222',true);
DO $denied$
BEGIN
 IF pg_temp.reader_count('11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa')<>0
  THEN RAISE EXCEPTION 'A different publisher read a private release'; END IF;
END $denied$;
ROLLBACK TO SAVEPOINT unprivileged_reader;

-- Withdrawal must remove the public pointer and make previous links unavailable.
DO $withdraw$
DECLARE
 pub uuid:='11111111-1111-4111-8111-111111111111';
 bill uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 reviewer uuid:='33333333-3333-4333-8333-333333333333';
 released uuid;
BEGIN
 SELECT release_id INTO released FROM ask_bill.release_active WHERE publisher_id=pub AND bill_id=bill;
 IF released IS NULL OR NOT ask_bill.withdraw_reviewed_release(pub,bill,released,reviewer)
  THEN RAISE EXCEPTION 'Source release withdrawal failed'; END IF;
END $withdraw$;
SAVEPOINT after_withdraw;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $withdrawn$
BEGIN
 IF pg_temp.reader_count('11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa')<>0
  THEN RAISE EXCEPTION 'A withdrawn release remained publicly readable'; END IF;
END $withdrawn$;
ROLLBACK TO SAVEPOINT after_withdraw;
ROLLBACK;
DO $cleanup$
BEGIN
 IF EXISTS (SELECT 1 FROM ask_bill.release_active) OR EXISTS (SELECT 1 FROM ask_bill.release_packs)
  THEN RAISE EXCEPTION 'A disposable public release test leaked committed records'; END IF;
END $cleanup$;
