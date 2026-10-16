-- AB-010 ephemeral PostgreSQL tests use the nonowner RLS test role from AB-007.
\set ON_ERROR_STOP on
GRANT EXECUTE ON FUNCTION ask_bill.enqueue_job(uuid,text,text) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.claim_job(uuid,uuid,integer) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.heartbeat_job(uuid,uuid,uuid,bigint,integer) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.complete_job_and_enqueue(uuid,uuid,uuid,bigint,text,text,jsonb) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.fail_job(uuid,uuid,uuid,bigint,boolean,text) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.reap_expired_jobs(uuid) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.claim_outbox(uuid,uuid,integer) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.ack_outbox(uuid,uuid,uuid,bigint) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.fail_outbox(uuid,uuid,uuid,bigint,boolean,text) TO ask_bill_test_reader;
GRANT EXECUTE ON FUNCTION ask_bill.reap_expired_outbox(uuid) TO ask_bill_test_reader;

-- Fixture job lives only in tenant A. Jobs for tenant B must remain invisible.
INSERT INTO ask_bill.jobs(id,publisher_id,kind,dedupe_key)
VALUES ('cccccccc-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ingest','source-x'),
       ('cccccccc-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','ingest','source-y'),
       ('cccccccc-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','publish','source-z');

BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE j record; previous uuid;
BEGIN
 SELECT ask_bill.enqueue_job('11111111-1111-4111-8111-111111111111','ingest','source-x') INTO previous;
 IF previous<>'cccccccc-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'Idempotent job enqueue created a second job'; END IF;
 IF (SELECT count(*) FROM ask_bill.jobs WHERE status='queued')<>2 THEN RAISE EXCEPTION 'Tenant leaked jobs'; END IF;
 SELECT * INTO j FROM ask_bill.claim_job('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',60);
 IF j.job_id<>'cccccccc-0000-4000-8000-000000000001' OR j.fence_version<>1 OR j.job_kind<>'ingest' THEN
  RAISE EXCEPTION 'Claim failed to fence tenant job'; END IF;
 IF NOT ask_bill.heartbeat_job('11111111-1111-4111-8111-111111111111',j.job_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,60) THEN
  RAISE EXCEPTION 'Valid heartbeat failed'; END IF;
 IF ask_bill.heartbeat_job('11111111-1111-4111-8111-111111111111',j.job_id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,60) THEN
  RAISE EXCEPTION 'Wrong worker renewed the lease'; END IF;
 BEGIN
  PERFORM * FROM ask_bill.claim_job('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',60);
  RAISE EXCEPTION 'Wrong tenant unexpectedly claimed a job';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
COMMIT;

-- Crash the first worker by simulating an expired deadline, without sleeping.
UPDATE ask_bill.jobs SET lease_until=clock_timestamp()-interval '1 second'
 WHERE id='cccccccc-0000-4000-8000-000000000001';
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE j record; count_outbox integer;
BEGIN
 SELECT * INTO j FROM ask_bill.claim_job('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',60);
 IF j.job_id<>'cccccccc-0000-4000-8000-000000000001' OR j.fence_version<>2 THEN
  RAISE EXCEPTION 'Expired job was not safely reclaimed'; END IF;
 IF ask_bill.complete_job_and_enqueue('11111111-1111-4111-8111-111111111111',j.job_id,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'published','job-one','{}') THEN
  RAISE EXCEPTION 'Stale worker committed after lease loss'; END IF;
 IF ask_bill.heartbeat_job('11111111-1111-4111-8111-111111111111',j.job_id,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,60) THEN RAISE EXCEPTION 'Stale heartbeat accepted'; END IF;
 BEGIN
  PERFORM ask_bill.complete_job_and_enqueue('11111111-1111-4111-8111-111111111111',j.job_id,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,'','bad-name','{}');
  RAISE EXCEPTION 'Invalid event mutated queue';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF (SELECT status FROM ask_bill.jobs WHERE id=j.job_id)<>'leased' THEN
  RAISE EXCEPTION 'Outbox validation rolled back job'; END IF;
 IF NOT ask_bill.complete_job_and_enqueue('11111111-1111-4111-8111-111111111111',j.job_id,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,'published','job-one','{"complete":true}') THEN
  RAISE EXCEPTION 'Claim owner could not atomically complete and enqueue'; END IF;
 IF ask_bill.complete_job_and_enqueue('11111111-1111-4111-8111-111111111111',j.job_id,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,'published','job-one','{}') THEN
  RAISE EXCEPTION 'Double completion accepted'; END IF;
 SELECT count(*) INTO count_outbox FROM ask_bill.outbox_events WHERE idempotency_key='job-one';
 IF count_outbox<>1 THEN RAISE EXCEPTION 'Duplicate outbox inserted'; END IF;
END $$;
COMMIT;

-- Same tenant second job: retry with bounded backoff and sanitized diagnostic.
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE j record;
BEGIN
 SELECT * INTO j FROM ask_bill.claim_job('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',60);
 IF j.job_id<>'cccccccc-0000-4000-8000-000000000003' THEN RAISE EXCEPTION 'Expected second queued job'; END IF;
 IF ask_bill.fail_job('11111111-1111-4111-8111-111111111111',j.job_id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,true,'TIMED_OUT') THEN
  RAISE EXCEPTION 'Wrong worker marked failure'; END IF;
 IF NOT ask_bill.fail_job('11111111-1111-4111-8111-111111111111',j.job_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,true,'TIMED_OUT') THEN
  RAISE EXCEPTION 'Owner retry failed'; END IF;
 IF (SELECT status FROM ask_bill.jobs WHERE id=j.job_id)<>'retry' THEN RAISE EXCEPTION 'Retry state missing'; END IF;
 IF (SELECT last_error_code FROM ask_bill.jobs WHERE id=j.job_id)<>'TIMED_OUT' THEN RAISE EXCEPTION 'Sanitized diagnostic missing'; END IF;
 SELECT * INTO j FROM ask_bill.claim_job('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',60);
 IF j.job_id IS NOT NULL THEN RAISE EXCEPTION 'Backoff ignored'; END IF;
END $$;
COMMIT;

-- Outbox delivery is fenced and idempotent, with crash-after-send recovery.
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE ev record;
BEGIN
 SELECT * INTO ev FROM ask_bill.claim_outbox('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',60);
 IF ev.event_id IS NULL OR ev.fence_version<>1 OR ev.idempotency_key<>'job-one' THEN RAISE EXCEPTION 'Initial outbox claim failed'; END IF;
 IF ask_bill.ack_outbox('11111111-1111-4111-8111-111111111111',ev.event_id,
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ev.fence_version) THEN RAISE EXCEPTION 'Wrong event owner acknowledged'; END IF;
END $$;
COMMIT;
UPDATE ask_bill.outbox_events SET lease_until=clock_timestamp()-interval '1 second' WHERE idempotency_key='job-one';
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
DECLARE ev record;
BEGIN
 SELECT * INTO ev FROM ask_bill.claim_outbox('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',60);
 IF ev.fence_version<>2 OR ev.idempotency_key<>'job-one' THEN RAISE EXCEPTION 'Outbox did not replay with new fence'; END IF;
 IF ask_bill.ack_outbox('11111111-1111-4111-8111-111111111111',ev.event_id,
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1) THEN RAISE EXCEPTION 'Stale outbox ack accepted'; END IF;
 IF NOT ask_bill.ack_outbox('11111111-1111-4111-8111-111111111111',ev.event_id,
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2) THEN RAISE EXCEPTION 'Current outbox ack failed'; END IF;
 IF ask_bill.ack_outbox('11111111-1111-4111-8111-111111111111',ev.event_id,
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2) THEN RAISE EXCEPTION 'Event double ack accepted'; END IF;
END $$;
COMMIT;

-- Reap an exhausted expired job into a diagnostic dead-letter without resurfacing it.
UPDATE ask_bill.jobs SET status='leased',lease_owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 lease_until=clock_timestamp()-interval '1 second',attempt=max_attempts
 WHERE id='cccccccc-0000-4000-8000-000000000003';
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $$
BEGIN
 IF ask_bill.reap_expired_jobs('11111111-1111-4111-8111-111111111111')<>1 THEN
  RAISE EXCEPTION 'Dead job was not reaped'; END IF;
 IF (SELECT status FROM ask_bill.jobs WHERE dedupe_key='source-z')<>'dead' THEN
  RAISE EXCEPTION 'Exhausted job not dead-lettered'; END IF;
 IF (SELECT last_error_code FROM ask_bill.jobs WHERE dedupe_key='source-z')<>'LEASE_EXPIRED' THEN
  RAISE EXCEPTION 'Dead-letter diagnostic missing'; END IF;
END $$;
ROLLBACK;

-- Rollback to make CI fixture safe when reused; staging/production never uses test keys.
DO $$ BEGIN
 IF (SELECT count(*) FROM ask_bill.outbox_events WHERE idempotency_key='job-one')<>1 THEN RAISE EXCEPTION 'Missing atomic outbox event'; END IF;
 IF (SELECT count(*) FROM ask_bill.jobs WHERE status='completed')<>1 THEN RAISE EXCEPTION 'Unexpected completed job count'; END IF;
END $$;
