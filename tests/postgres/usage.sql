-- AB-034: disposable PostgreSQL integration; no network or production credentials.
\set ON_ERROR_STOP on
INSERT INTO ask_bill.sessions(id,publisher_id,version_id,capability_sha256,expires_at) VALUES
 ('cccccccc-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',repeat('c',64),now()+interval '30 minutes'),
 ('eeeeeeee-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',repeat('e',64),now()+interval '30 minutes'),
 ('dddddddd-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',repeat('d',64),now()+interval '30 minutes');
INSERT INTO ask_bill.usage_limits (publisher_id,global_limit,session_limit,generation_enabled) VALUES
 ('11111111-1111-4111-8111-111111111111',100,80,false),
 ('22222222-2222-4222-8222-222222222222',100,80,false);
GRANT SELECT,INSERT,UPDATE ON ask_bill.usage_reservations TO ask_bill_test_reader;
GRANT SELECT,INSERT,UPDATE ON ask_bill.usage_limits TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.reserve_generation(uuid,uuid,text,bigint,timestamptz) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.settle_generation(uuid,uuid,bigint,boolean) TO ask_bill_test_reader;
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
BEGIN
  BEGIN
    PERFORM ask_bill.reserve_generation('11111111-1111-4111-8111-111111111111','cccccccc-1111-4111-8111-111111111111','disabled-req-001',10,now()+interval '5 minutes');
    RAISE EXCEPTION 'Generation enabled without explicit policy';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
UPDATE ask_bill.usage_limits SET generation_enabled=true WHERE publisher_id='11111111-1111-4111-8111-111111111111';
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE first_id uuid; same_id uuid; second_id uuid;
BEGIN
 SELECT ask_bill.reserve_generation('11111111-1111-4111-8111-111111111111','cccccccc-1111-4111-8111-111111111111','quota-request-one',60,now()+interval '5 minutes') INTO first_id;
 SELECT ask_bill.reserve_generation('11111111-1111-4111-8111-111111111111','cccccccc-1111-4111-8111-111111111111','quota-request-one',60,now()+interval '5 minutes') INTO same_id;
 IF first_id IS NULL OR first_id IS DISTINCT FROM same_id THEN RAISE EXCEPTION 'Idempotency replay doubled charge'; END IF;
 BEGIN
  PERFORM ask_bill.reserve_generation('11111111-1111-4111-8111-111111111111','cccccccc-1111-4111-8111-111111111111','quota-request-one',61,now()+interval '5 minutes');
  RAISE EXCEPTION 'Reused key with changed budget was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  PERFORM ask_bill.reserve_generation('11111111-1111-4111-8111-111111111111','cccccccc-1111-4111-8111-111111111111','quota-request-over',30,now()+interval '5 minutes');
  RAISE EXCEPTION 'Session quota overrun was allowed';
 EXCEPTION WHEN program_limit_exceeded THEN NULL;
 END;
 IF NOT ask_bill.settle_generation('11111111-1111-4111-8111-111111111111',first_id,25,false) THEN RAISE EXCEPTION 'Settlement failed'; END IF;
 IF NOT ask_bill.settle_generation('11111111-1111-4111-8111-111111111111',first_id,25,false) THEN RAISE EXCEPTION 'Idempotent replay failed'; END IF;
 BEGIN
  PERFORM ask_bill.settle_generation('11111111-1111-4111-8111-111111111111',first_id,26,false);
  RAISE EXCEPTION 'Settlement changed after billing';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 SELECT ask_bill.reserve_generation('11111111-1111-4111-8111-111111111111','cccccccc-1111-4111-8111-111111111111','quota-request-two',50,now()+interval '5 minutes') INTO second_id;
 IF second_id IS NULL THEN RAISE EXCEPTION 'Available settled quota not reused'; END IF;
 BEGIN
  PERFORM ask_bill.reserve_generation('22222222-2222-4222-8222-222222222222','dddddddd-2222-4222-8222-222222222222','wrong-tenant-req',5,now()+interval '5 minutes');
  RAISE EXCEPTION 'Cross-tenant reservation succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF (SELECT count(*) FROM ask_bill.usage_reservations WHERE publisher_id='22222222-2222-4222-8222-222222222222')<>0 THEN
  RAISE EXCEPTION 'Other publisher data visible';
 END IF;
END $$;
COMMIT;
-- Global lifetime use now 25 + 50 = 75; a concurrent 20+20 race must allow exactly one.
