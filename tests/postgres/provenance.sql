-- Ask Bill AB-013: disposable PostgreSQL proof of immutable source registration and tenant isolation.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='ask_bill' AND tablename IN ('source_objects','source_import_events')) <> 2 THEN
  RAISE EXCEPTION 'Missing provenance tables'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='ask_bill' AND policyname='publisher_scope' AND tablename IN ('source_objects','source_import_events')) <> 2 THEN
  RAISE EXCEPTION 'Missing tenant provenance policies'; END IF;
END $$;
INSERT INTO ask_bill.source_objects(publisher_id,sha256,byte_length,mime_type,storage_key) VALUES
 ('11111111-1111-4111-8111-111111111111',repeat('a',64),17,'text/plain','11111111-1111-4111-8111-111111111111/sha256/'||repeat('a',64)),
 ('22222222-2222-4222-8222-222222222222',repeat('b',64),17,'text/plain','22222222-2222-4222-8222-222222222222/sha256/'||repeat('b',64)) ON CONFLICT (publisher_id,sha256) DO NOTHING;
INSERT INTO ask_bill.source_import_events(publisher_id,bill_id,version_id,source_object_id,origin,source_url,retrieved_at,canonicalization_version)
SELECT '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',id,'official','https://www.congress.gov/bill/119th-congress/house-bill/1/text',now(),'v1'
FROM ask_bill.source_objects WHERE publisher_id='11111111-1111-4111-8111-111111111111' AND sha256=repeat('a',64);
INSERT INTO ask_bill.source_import_events(publisher_id,bill_id,version_id,source_object_id,origin,source_url,retrieved_at,canonicalization_version)
SELECT '22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',id,'publisher-upload',NULL,now(),'v1'
FROM ask_bill.source_objects WHERE publisher_id='22222222-2222-4222-8222-222222222222' AND sha256=repeat('b',64);
-- Attempt to mutate a stored digest/URL must fail even as migration role.
DO $$ BEGIN
 BEGIN
  UPDATE ask_bill.source_objects SET byte_length=999 WHERE publisher_id='11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'Source object mutation was allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE ask_bill.source_import_events SET source_url='https://attacker.example/' WHERE publisher_id='11111111-1111-4111-8111-111111111111';
  RAISE EXCEPTION 'Source event mutation was allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ask_bill.source_objects,ask_bill.source_import_events TO ask_bill_test_reader;
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM ask_bill.source_objects) OR EXISTS (SELECT 1 FROM ask_bill.source_import_events) THEN RAISE EXCEPTION 'Unscoped provenance disclosure'; END IF;
END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$ DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM ask_bill.source_objects;
 IF n<>1 THEN RAISE EXCEPTION 'Publisher One source isolation failed'; END IF;
 SELECT count(*) INTO n FROM ask_bill.source_import_events;
 IF n<>1 THEN RAISE EXCEPTION 'Publisher One source-event isolation failed'; END IF;
 UPDATE ask_bill.source_objects SET byte_length=42 WHERE publisher_id='22222222-2222-4222-8222-222222222222';
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>0 THEN RAISE EXCEPTION 'Cross tenant mutation occurred'; END IF;
 BEGIN
  INSERT INTO ask_bill.source_objects(publisher_id,sha256,byte_length,mime_type,storage_key)
  VALUES('22222222-2222-4222-8222-222222222222',repeat('c',64),1,'text/plain','22222222-2222-4222-8222-222222222222/sha256/'||repeat('c',64));
  RAISE EXCEPTION 'Cross-tenant insertion was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
DO $$ BEGIN
 IF (SELECT count(*) FROM ask_bill.source_objects)<>2 THEN RAISE EXCEPTION 'Original source objects lost'; END IF;
 IF (SELECT count(*) FROM ask_bill.source_import_events)<>2 THEN RAISE EXCEPTION 'Original provenance events lost'; END IF;
END $$;
