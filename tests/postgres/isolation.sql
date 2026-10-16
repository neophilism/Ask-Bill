-- Dedicated test fixture for Ask Bill, unrelated to any external product/company.
-- CI only: the migration is exercised twice before this fixture.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'ask_bill') <> 10 THEN
    RAISE EXCEPTION 'Expected exactly ten Ask Bill tables';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'ask_bill' AND policyname = 'publisher_scope') <> 10 THEN
    RAISE EXCEPTION 'Expected a tenant policy on every Ask Bill table';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'ask_bill' AND c.relkind = 'r' AND (c.relrowsecurity IS NOT TRUE OR c.relforcerowsecurity IS NOT TRUE)) THEN
    RAISE EXCEPTION 'Every tenant table must enable and force row-level security';
  END IF;
END
$$;

INSERT INTO ask_bill.publishers(id, slug, display_name) VALUES
 ('11111111-1111-4111-8111-111111111111','publisher-one','Publisher One'),
 ('22222222-2222-4222-8222-222222222222','publisher-two','Publisher Two');
INSERT INTO ask_bill.bills(id,publisher_id,jurisdiction,title) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','US','Draft Alpha'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','US','Draft Beta');
INSERT INTO ask_bill.bill_versions(id,publisher_id,bill_id,language,status,raw_byte_sha256,canonical_text_sha256,canonicalization_version,retrieved_at) VALUES
 ('aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','en-US','draft',repeat('a',64),repeat('a',64),'v1',now()),
 ('bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','en-US','draft',repeat('b',64),repeat('b',64),'v1',now());
INSERT INTO ask_bill.provisions(publisher_id,version_id,provision_path,canonical_text) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa','Section 1','Alpha text'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb','Section 1','Beta text');

CREATE ROLE ask_bill_test_reader NOLOGIN NOBYPASSRLS;
GRANT USAGE ON SCHEMA ask_bill TO ask_bill_test_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ask_bill TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.current_publisher_id() TO ask_bill_test_reader;

-- Missing transaction-local tenant context must never disclose rows.
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
DO $$
BEGIN
  IF (SELECT count(*) FROM ask_bill.bills) <> 0 THEN
    RAISE EXCEPTION 'Missing publisher context exposed private bills';
  END IF;
  IF (SELECT count(*) FROM ask_bill.provisions) <> 0 THEN
    RAISE EXCEPTION 'Missing publisher context exposed private provisions';
  END IF;
END $$;
ROLLBACK;

-- Publisher One must not read, mutate, or attach Publisher Two records.
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM ask_bill.bills;
  IF n <> 1 THEN RAISE EXCEPTION 'Publisher One scope leaked data: %',n; END IF;
  SELECT count(*) INTO n FROM ask_bill.provisions;
  IF n <> 1 THEN RAISE EXCEPTION 'Publisher One provisions leaked: %',n; END IF;
  SELECT count(*) INTO n FROM ask_bill.bill_versions WHERE publication='published';
  IF n <> 0 THEN RAISE EXCEPTION 'Private draft became public'; END IF;
  UPDATE ask_bill.bills SET title='ILLEGAL UPDATE' WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant update succeeded'; END IF;
  DELETE FROM ask_bill.bills WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'Cross-tenant deletion succeeded'; END IF;
  BEGIN
    INSERT INTO ask_bill.bills(publisher_id,jurisdiction,title)
    VALUES ('22222222-2222-4222-8222-222222222222','US','ILLEGAL INSERT');
    RAISE EXCEPTION 'Cross-tenant insertion was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected RLS violation from an untrusted client tenant
  END;
  BEGIN
    INSERT INTO ask_bill.bill_versions(publisher_id,bill_id,language,status,raw_byte_sha256,canonical_text_sha256,canonicalization_version,retrieved_at)
    VALUES ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'en-US','draft',repeat('a',64),repeat('a',64),'v1',now());
    RAISE EXCEPTION 'Cross-publisher composite FK was bypassed';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL; -- the other publisher's bill cannot become ours
  END;
  BEGIN
    UPDATE ask_bill.bill_versions SET publication='published',published_at=now()
      WHERE id='aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
    RAISE EXCEPTION 'An incomplete source was published';
  EXCEPTION WHEN check_violation THEN
    NULL; -- incomplete source publication is prohibited
  END;
END $$;
ROLLBACK;

-- Publisher Two only sees its own corresponding bill.
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','22222222-2222-4222-8222-222222222222',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM ask_bill.bills) <> 1 THEN
    RAISE EXCEPTION 'Publisher Two row isolation failed';
  END IF;
  IF EXISTS (SELECT 1 FROM ask_bill.bills WHERE title='Draft Alpha') THEN
    RAISE EXCEPTION 'Publisher One draft leaked to Publisher Two';
  END IF;
END $$;
ROLLBACK;

-- Verify superuser fixture data remains unchanged by adversarial transactions.
DO $$
BEGIN
  IF (SELECT count(*) FROM ask_bill.bills) <> 2 THEN RAISE EXCEPTION 'Fixture bills corrupted'; END IF;
  IF (SELECT count(*) FROM ask_bill.bill_versions WHERE publication='published') <> 0 THEN
    RAISE EXCEPTION 'Incomplete draft publication escaped the transaction';
  END IF;
END $$;
