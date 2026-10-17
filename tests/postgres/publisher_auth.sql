-- Real PostgreSQL RLS and one-use OIDC state checks; only disposable test data.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ask_bill_publisher_auth_test') THEN
  CREATE ROLE ask_bill_publisher_auth_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA ask_bill TO ask_bill_publisher_auth_test;
GRANT SELECT,INSERT,UPDATE,DELETE ON ask_bill.publisher_auth_identities,ask_bill.publisher_auth_sessions,ask_bill.publisher_login_transactions,ask_bill.publisher_memberships TO ask_bill_publisher_auth_test;
INSERT INTO ask_bill.publishers(id,slug,display_name) VALUES
 ('61000000-1111-4111-8111-111111111111','publisher-auth-fixture-a','Auth fixture A'),
 ('61000000-2222-4222-8222-222222222222','publisher-auth-fixture-b','Auth fixture B');
INSERT INTO ask_bill.publisher_memberships(publisher_id,user_id,role) VALUES
 ('61000000-1111-4111-8111-111111111111','62000000-1111-4111-8111-111111111111','owner'),
 ('61000000-1111-4111-8111-111111111111','62000000-3333-4333-8333-333333333333','viewer'),
 ('61000000-2222-4222-8222-222222222222','62000000-2222-4222-8222-222222222222','owner');
INSERT INTO ask_bill.publisher_auth_identities(publisher_id,identity_sha256,user_id) VALUES
 ('61000000-1111-4111-8111-111111111111',repeat('a',64),'62000000-1111-4111-8111-111111111111'),
 ('61000000-1111-4111-8111-111111111111',repeat('c',64),'62000000-1111-4111-8111-111111111111'),
 ('61000000-2222-4222-8222-222222222222',repeat('b',64),'62000000-2222-4222-8222-222222222222');
INSERT INTO ask_bill.publisher_auth_sessions(publisher_id,session_sha256,user_id,identity_sha256,csrf_sha256,issued_at,expires_at,mfa_verified_at) VALUES
 ('61000000-1111-4111-8111-111111111111',repeat('d',64),'62000000-1111-4111-8111-111111111111',repeat('a',64),repeat('e',64),now(),now()+interval '30 minutes',now()),
 ('61000000-2222-4222-8222-222222222222',repeat('f',64),'62000000-2222-4222-8222-222222222222',repeat('b',64),repeat('e',64),now(),now()+interval '30 minutes',now());
SET LOCAL ROLE ask_bill_publisher_auth_test;
SELECT set_config('ask_bill.publisher_id','61000000-1111-4111-8111-111111111111',true);
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM ask_bill.publisher_auth_sessions;
 IF n<>1 THEN RAISE EXCEPTION 'Publisher sessions crossed RLS boundary'; END IF;
 SELECT count(*) INTO n FROM ask_bill.publisher_auth_identities;
 IF n<>2 THEN RAISE EXCEPTION 'Publisher identities crossed RLS boundary'; END IF;
 BEGIN
  INSERT INTO ask_bill.publisher_login_transactions(publisher_id,state_sha256,binding_sha256,nonce,pkce_verifier,return_path,created_at,expires_at)
  VALUES('61000000-2222-4222-8222-222222222222',repeat('a',64),repeat('b',64),repeat('N',43),repeat('V',43),'/admin',now(),now()+interval '5 minutes');
  RAISE EXCEPTION 'Cross-publisher login transaction insert unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO ask_bill.publisher_login_transactions(publisher_id,state_sha256,binding_sha256,nonce,pkce_verifier,return_path,created_at,expires_at)
 VALUES('61000000-1111-4111-8111-111111111111',repeat('a',64),repeat('b',64),repeat('N',43),repeat('V',43),'/admin',now(),now()+interval '5 minutes');
 WITH consumed AS (DELETE FROM ask_bill.publisher_login_transactions WHERE state_sha256=repeat('a',64) AND binding_sha256=repeat('c',64) AND expires_at>now() RETURNING 1)
 SELECT count(*) INTO n FROM consumed;
 IF n<>0 THEN RAISE EXCEPTION 'Wrong browser binding consumed login state'; END IF;
 WITH consumed AS (DELETE FROM ask_bill.publisher_login_transactions WHERE state_sha256=repeat('a',64) AND binding_sha256=repeat('b',64) AND expires_at>now() RETURNING 1)
 SELECT count(*) INTO n FROM consumed;
 IF n<>1 THEN RAISE EXCEPTION 'Valid login state did not redeem'; END IF;
 WITH consumed AS (DELETE FROM ask_bill.publisher_login_transactions WHERE state_sha256=repeat('a',64) AND binding_sha256=repeat('b',64) AND expires_at>now() RETURNING 1)
 SELECT count(*) INTO n FROM consumed;
 IF n<>0 THEN RAISE EXCEPTION 'Login state replay unexpectedly succeeded'; END IF;
 BEGIN
  INSERT INTO ask_bill.publisher_auth_sessions(publisher_id,session_sha256,user_id,identity_sha256,csrf_sha256,issued_at,expires_at)
  VALUES('61000000-1111-4111-8111-111111111111',repeat('1',64),'62000000-1111-4111-8111-111111111111',repeat('a',64),repeat('2',64),now(),now()+interval '31 minutes');
  RAISE EXCEPTION 'Unbounded session duration unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO ask_bill.publisher_auth_sessions(publisher_id,session_sha256,user_id,identity_sha256,csrf_sha256,issued_at,expires_at)
  VALUES('61000000-1111-4111-8111-111111111111',repeat('1',64),'62000000-1111-4111-8111-111111111111',repeat('f',64),repeat('2',64),now(),now()+interval '10 minutes');
  RAISE EXCEPTION 'Unenrolled session identity unexpectedly accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  INSERT INTO ask_bill.publisher_auth_sessions(publisher_id,session_sha256,user_id,identity_sha256,csrf_sha256,issued_at,expires_at)
  VALUES('61000000-1111-4111-8111-111111111111',repeat('1',64),'62000000-3333-4333-8333-333333333333',repeat('a',64),repeat('2',64),now(),now()+interval '10 minutes');
  RAISE EXCEPTION 'Session identity for another enrolled user unexpectedly accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 UPDATE ask_bill.publisher_auth_identities SET disabled_at=now() WHERE identity_sha256=repeat('a',64);
 SELECT count(*) INTO n FROM ask_bill.publisher_auth_sessions s JOIN ask_bill.publisher_auth_identities i
 ON i.publisher_id=s.publisher_id AND i.identity_sha256=s.identity_sha256 AND i.user_id=s.user_id
 WHERE s.publisher_id='61000000-1111-4111-8111-111111111111' AND s.session_sha256=repeat('d',64) AND i.disabled_at IS NULL;
 IF n<>0 THEN RAISE EXCEPTION 'Disabled identity still authorizes its session'; END IF;
 SELECT count(*) INTO n FROM ask_bill.publisher_auth_identities WHERE disabled_at IS NULL;
 IF n<>1 THEN RAISE EXCEPTION 'Unrelated identity was changed by identity-specific revocation'; END IF;
END $$;
ROLLBACK;
\echo 'Publisher OIDC state, tenant isolation, session limits and identity revocation passed.'
