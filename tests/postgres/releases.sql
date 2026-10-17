-- AB-024 tested in disposable PostgreSQL only; review/publish is NOT yet exposed to a user.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='ask_bill' AND policyname='publisher_scope' AND tablename IN ('release_packs','release_active'))<>2 THEN
  RAISE EXCEPTION 'Release RLS policies missing'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='ask_bill' AND c.relname IN ('release_packs','release_active') AND c.relforcerowsecurity)<>2 THEN
  RAISE EXCEPTION 'Release RLS must be enforced'; END IF;
END $$;
INSERT INTO ask_bill.publisher_memberships(publisher_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','owner');
-- The unprivileged runtime role may read scoped status but cannot publish or change release pointers.
GRANT SELECT ON ask_bill.release_packs,ask_bill.release_active TO ask_bill_test_reader;
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM ask_bill.release_packs) THEN RAISE EXCEPTION 'Unscoped release visibility'; END IF;
 BEGIN
  PERFORM ask_bill.activate_reviewed_release('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   gen_random_uuid(),NULL,'33333333-3333-4333-8333-333333333333');
  RAISE EXCEPTION 'Unprivileged user invoked publishing';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $release$
DECLARE pub uuid:='11111111-1111-4111-8111-111111111111';
        b uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        v uuid:='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
        reviewer uuid:='33333333-3333-4333-8333-333333333333';
        generation uuid; provision uuid; content text; release uuid; rows_count integer;
BEGIN
 SELECT id,canonical_text INTO provision,content FROM ask_bill.provisions WHERE publisher_id=pub AND version_id=v LIMIT 1;
 INSERT INTO ask_bill.search_generations(publisher_id,version_id,source_sha256,index_sha256,expected_entries)
 VALUES(pub,v,repeat('a',64),repeat('e',64),1) RETURNING id INTO generation;
 INSERT INTO ask_bill.search_entries(publisher_id,version_id,generation_id,provision_id,canonical_text,text_sha256)
 VALUES(pub,v,generation,provision,content,encode(sha256(convert_to(content,'UTF8')),'hex'));
 UPDATE ask_bill.search_generations SET status='complete' WHERE publisher_id=pub AND id=generation;
 IF NOT ask_bill.activate_search_generation(pub,v,generation,NULL) THEN RAISE EXCEPTION 'Required index activation failed'; END IF;
 INSERT INTO ask_bill.release_packs(publisher_id,bill_id,version_id,generation_id,
   original_sha256,canonical_sha256,manifest_sha256,review_sha256,reviewed_by)
 VALUES(pub,b,v,generation,repeat('a',64),repeat('a',64),repeat('b',64),repeat('c',64),reviewer)
 RETURNING id INTO release;
 IF ask_bill.activate_reviewed_release(pub,b,release,NULL,reviewer) THEN
  RAISE EXCEPTION 'Incomplete, unreviewed source published'; END IF;
 IF EXISTS(SELECT 1 FROM ask_bill.release_active) THEN RAISE EXCEPTION 'Pointer exposed partial pack'; END IF;
 UPDATE ask_bill.bill_versions SET source_complete=true,publication='reviewed' WHERE publisher_id=pub AND id=v;
 IF ask_bill.activate_reviewed_release(pub,b,release,gen_random_uuid(),reviewer) THEN
  RAISE EXCEPTION 'Stale expected-pointer value activated'; END IF;
 IF NOT ask_bill.activate_reviewed_release(pub,b,release,NULL,reviewer) THEN
  RAISE EXCEPTION 'Reviewed release failed atomic activation'; END IF;
 IF (SELECT publication FROM ask_bill.bill_versions WHERE publisher_id=pub AND id=v)<>'published' THEN
  RAISE EXCEPTION 'Published version state missing'; END IF;
 IF (SELECT release_id FROM ask_bill.release_active WHERE publisher_id=pub AND bill_id=b) IS DISTINCT FROM release THEN
  RAISE EXCEPTION 'Atomic pointer does not match approved release'; END IF;
 IF (SELECT count(*) FROM ask_bill.outbox_events WHERE publisher_id=pub AND event_type='release.published')<>1 THEN
  RAISE EXCEPTION 'Atomic published notification missing'; END IF;
 IF ask_bill.activate_reviewed_release(pub,b,release,NULL,reviewer) THEN
  RAISE EXCEPTION 'Stale publisher replaced release pointer'; END IF;
 BEGIN
  UPDATE ask_bill.release_packs SET manifest_sha256=repeat('f',64) WHERE id=release;
  RAISE EXCEPTION 'Published release pack mutated';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM ask_bill.activate_reviewed_release('22222222-2222-4222-8222-222222222222',b,release,NULL,reviewer);
  RAISE EXCEPTION 'Cross-publisher activation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT ask_bill.withdraw_reviewed_release(pub,b,release,reviewer) THEN
  RAISE EXCEPTION 'Owner withdrawal failed'; END IF;
 IF EXISTS(SELECT 1 FROM ask_bill.release_active WHERE publisher_id=pub AND bill_id=b) THEN
  RAISE EXCEPTION 'Withdrawn pack pointer still active'; END IF;
 IF (SELECT publication FROM ask_bill.bill_versions WHERE publisher_id=pub AND id=v)<>'withdrawn' THEN
  RAISE EXCEPTION 'Version withdrawal not visible'; END IF;
 SELECT count(*) INTO rows_count FROM ask_bill.outbox_events WHERE publisher_id=pub AND event_type='release.withdrawn';
 IF rows_count<>1 THEN RAISE EXCEPTION 'Missing transactional withdrawal notification'; END IF;
END $release$;
ROLLBACK;
-- No release operation escapes an aborted review transaction.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM ask_bill.release_active) OR EXISTS(SELECT 1 FROM ask_bill.release_packs) THEN
  RAISE EXCEPTION 'Release rollback leaked pointer or staged records'; END IF;
END $$;
