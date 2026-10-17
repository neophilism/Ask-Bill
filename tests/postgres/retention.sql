-- AB-095 tenant-scoped expired session/data cleanup test, disposable PostgreSQL only.
\set ON_ERROR_STOP on
GRANT EXECUTE ON FUNCTION ask_bill.expire_session_data(uuid,timestamptz,integer) TO ask_bill_test_reader;
BEGIN;
INSERT INTO ask_bill.sessions(id,publisher_id,version_id,capability_sha256,created_at,expires_at) VALUES
 ('77777777-7777-4777-8777-777777777771','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',repeat('7',64),clock_timestamp()-interval '4 days',clock_timestamp()-interval '3 days'),
 ('77777777-7777-4777-8777-777777777772','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',repeat('7',64),clock_timestamp()-interval '3 days',clock_timestamp()-interval '2 days'),
 ('77777777-7777-4777-8777-777777777773','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',repeat('7',64),clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day'),
 ('88888888-8888-4888-8888-888888888881','22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',repeat('8',64),clock_timestamp()-interval '3 days',clock_timestamp()-interval '2 days');
INSERT INTO ask_bill.usage_reservations(publisher_id,session_id,reservation_key,reserved_units,expires_at)
VALUES
 ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777771','retention-old-one',1,clock_timestamp()-interval '3 days'),
 ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777772','retention-old-two',1,clock_timestamp()-interval '2 days'),
 ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777773','retention-active',1,clock_timestamp()+interval '1 day'),
 ('22222222-2222-4222-8222-222222222222','88888888-8888-4888-8888-888888888881','retention-other',1,clock_timestamp()-interval '2 days');
SET LOCAL ROLE ask_bill_test_reader;
SELECT set_config('ask_bill.publisher_id','11111111-1111-4111-8111-111111111111',true);
DO $verify$
DECLARE first_pass record; second_pass record; idempotent record; remaining integer;
BEGIN
 SELECT * INTO first_pass FROM ask_bill.expire_session_data('11111111-1111-4111-8111-111111111111',clock_timestamp(),1);
 IF first_pass.sessions_removed<>1 OR first_pass.reservations_removed<>1 THEN
   RAISE EXCEPTION 'First limited cleanup did not delete exactly one expired session and reservation';
 END IF;
 IF EXISTS (SELECT 1 FROM ask_bill.sessions WHERE id='77777777-7777-4777-8777-777777777771') THEN
   RAISE EXCEPTION 'Oldest expired session was not first';
 END IF;
 SELECT * INTO second_pass FROM ask_bill.expire_session_data('11111111-1111-4111-8111-111111111111',clock_timestamp(),100);
 IF second_pass.sessions_removed<>1 OR second_pass.reservations_removed<>1 THEN
   RAISE EXCEPTION 'Remaining expired session cleanup failed';
 END IF;
 SELECT * INTO idempotent FROM ask_bill.expire_session_data('11111111-1111-4111-8111-111111111111',clock_timestamp(),100);
 IF idempotent.sessions_removed<>0 OR idempotent.reservations_removed<>0 THEN
   RAISE EXCEPTION 'Repeated cleanup was not idempotent';
 END IF;
 SELECT count(*) INTO remaining FROM ask_bill.sessions WHERE publisher_id='11111111-1111-4111-8111-111111111111' AND id IN ('77777777-7777-4777-8777-777777777771','77777777-7777-4777-8777-777777777772','77777777-7777-4777-8777-777777777773');
 IF remaining<>1 THEN RAISE EXCEPTION 'Active session was deleted'; END IF;
 SELECT count(*) INTO remaining FROM ask_bill.usage_reservations WHERE reservation_key='retention-active';
 IF remaining<>1 THEN RAISE EXCEPTION 'Active usage reservation deleted'; END IF;
 BEGIN
   PERFORM * FROM ask_bill.expire_session_data('22222222-2222-4222-8222-222222222222',clock_timestamp(),100);
   RAISE EXCEPTION 'Cross-publisher cleanup was allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   PERFORM * FROM ask_bill.expire_session_data('11111111-1111-4111-8111-111111111111',clock_timestamp()+interval '1 day',100);
   RAISE EXCEPTION 'Future cutoff was allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 BEGIN
   PERFORM * FROM ask_bill.expire_session_data('11111111-1111-4111-8111-111111111111',clock_timestamp(),0);
   RAISE EXCEPTION 'Unbounded cleanup was allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END
$verify$;
ROLLBACK;

-- Null/missing publisher context cannot access another tenant's cleanup function.
BEGIN;
SET LOCAL ROLE ask_bill_test_reader;
DO $missing$
BEGIN
 BEGIN
   PERFORM * FROM ask_bill.expire_session_data('11111111-1111-4111-8111-111111111111',clock_timestamp(),10);
   RAISE EXCEPTION 'Missing tenant context was not rejected';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END
$missing$;
ROLLBACK;
