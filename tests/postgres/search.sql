-- AB-023 disposable PostgreSQL 17 proof: generation immutability, tenant isolation and CAS activation.
\set ON_ERROR_STOP on
GRANT SELECT,INSERT,UPDATE,DELETE ON ask_bill.search_generations,ask_bill.search_entries,ask_bill.search_active TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.activate_search_generation(uuid,uuid,uuid,uuid) TO ask_bill_test_reader;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='ask_bill' AND policyname='publisher_scope' AND tablename IN ('search_generations','search_entries','search_active'))<>3
 THEN RAISE EXCEPTION 'Search RLS policies missing'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='ask_bill' AND c.relname IN ('search_generations','search_entries','search_active') AND c.relforcerowsecurity)<>3
 THEN RAISE EXCEPTION 'Search RLS must be forced on all tables'; END IF;
END $$;
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
DO $$ DECLARE
 pub uuid:='11111111-1111-4111-8111-111111111111';
 other_pub uuid:='22222222-2222-4222-8222-222222222222';
 v uuid:='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
 provision uuid;
 text_value text;
 generation uuid;
 next_generation uuid;
 broken_generation uuid;
 row_count integer;
BEGIN
 IF EXISTS(SELECT 1 FROM ask_bill.search_generations) THEN RAISE EXCEPTION 'Unscoped search leaked rows'; END IF;
 PERFORM set_config('ask_bill.publisher_id',pub::text,true);
 SELECT id,canonical_text INTO provision,text_value FROM ask_bill.provisions WHERE publisher_id=pub AND version_id=v LIMIT 1;
 IF provision IS NULL THEN RAISE EXCEPTION 'Source provision missing for index test'; END IF;
 BEGIN
  INSERT INTO ask_bill.search_generations(publisher_id,version_id,source_sha256,index_sha256,expected_entries)
   VALUES(other_pub,v,repeat('a',64),repeat('b',64),1);
  RAISE EXCEPTION 'Cross-tenant index generation inserted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO ask_bill.search_generations(publisher_id,version_id,source_sha256,index_sha256,expected_entries)
  VALUES(pub,v,repeat('a',64),repeat('b',64),2) RETURNING id INTO broken_generation;
 BEGIN
  UPDATE ask_bill.search_generations SET status='complete' WHERE id=broken_generation;
  RAISE EXCEPTION 'Incomplete generation was accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE ask_bill.search_generations SET status='failed' WHERE id=broken_generation;
 INSERT INTO ask_bill.search_generations(publisher_id,version_id,source_sha256,index_sha256,expected_entries)
  VALUES(pub,v,repeat('a',64),repeat('c',64),1) RETURNING id INTO generation;
 BEGIN
  INSERT INTO ask_bill.search_entries(publisher_id,version_id,generation_id,provision_id,canonical_text,text_sha256)
   VALUES(pub,v,generation,provision,'tampered',repeat('f',64));
  RAISE EXCEPTION 'Tampered indexed source was accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO ask_bill.search_entries(publisher_id,version_id,generation_id,provision_id,canonical_text,text_sha256)
  VALUES(pub,v,generation,provision,text_value,encode(sha256(convert_to(text_value,'UTF8')),'hex'));
 UPDATE ask_bill.search_generations SET status='complete' WHERE id=generation;
 IF NOT ask_bill.activate_search_generation(pub,v,generation,NULL) THEN RAISE EXCEPTION 'Activation failed'; END IF;
 SELECT count(*) INTO row_count FROM ask_bill.search_active WHERE publisher_id=pub AND version_id=v AND generation_id=generation;
 IF row_count<>1 THEN RAISE EXCEPTION 'Missing atomic active index pointer'; END IF;
 BEGIN
  UPDATE ask_bill.search_entries SET canonical_text='changed' WHERE generation_id=generation;
  RAISE EXCEPTION 'Completed index was mutable';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE ask_bill.search_generations SET status='building' WHERE id=generation;
  RAISE EXCEPTION 'Completed generation reopened';
 EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO ask_bill.search_generations(publisher_id,version_id,source_sha256,index_sha256,expected_entries)
  VALUES(pub,v,repeat('a',64),repeat('d',64),1) RETURNING id INTO next_generation;
 INSERT INTO ask_bill.search_entries(publisher_id,version_id,generation_id,provision_id,canonical_text,text_sha256)
  VALUES(pub,v,next_generation,provision,text_value,encode(sha256(convert_to(text_value,'UTF8')),'hex'));
 UPDATE ask_bill.search_generations SET status='complete' WHERE id=next_generation;
 IF ask_bill.activate_search_generation(pub,v,next_generation,NULL) THEN RAISE EXCEPTION 'Stale writer replaced index'; END IF;
 IF NOT ask_bill.activate_search_generation(pub,v,next_generation,generation) THEN RAISE EXCEPTION 'Valid CAS swap failed'; END IF;
 SELECT revision INTO row_count FROM ask_bill.search_active WHERE publisher_id=pub AND version_id=v;
 IF row_count<>2 THEN RAISE EXCEPTION 'Index pointer revision did not advance'; END IF;
 SELECT count(*) INTO row_count FROM ask_bill.search_entries WHERE publisher_id=pub AND version_id=v AND search_vector @@ plainto_tsquery('english','Alpha');
 IF row_count<>2 THEN RAISE EXCEPTION 'Search text index failed'; END IF;
 BEGIN
  PERFORM ask_bill.activate_search_generation(other_pub,v,next_generation,NULL);
  RAISE EXCEPTION 'Cross-tenant activation did not reject';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
EXCEPTION WHEN insufficient_privilege THEN
 RAISE EXCEPTION 'Tenant isolation test failed unexpectedly';
END $$;
ROLLBACK;
-- After rollback no durable pointer from the isolated test should exist.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM ask_bill.search_active) THEN RAISE EXCEPTION 'Transaction rollback lost index isolation'; END IF;
END $$;
