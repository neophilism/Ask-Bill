-- AB-008 real OIDC state, explicit identity enrollment, and revocable opaque sessions.
-- Apply after migrations/001_initial.sql with the schema owner; runtime uses FORCE RLS.
BEGIN;
CREATE TABLE IF NOT EXISTS ask_bill.publisher_auth_identities (
 publisher_id uuid NOT NULL,
 identity_sha256 text NOT NULL CHECK(identity_sha256 ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL,
 disabled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(publisher_id,identity_sha256),
 FOREIGN KEY(publisher_id,user_id) REFERENCES ask_bill.publisher_memberships(publisher_id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ask_bill.publisher_login_transactions (
 publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE CASCADE,
 state_sha256 text NOT NULL CHECK(state_sha256 ~ '^[a-f0-9]{64}$'),
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
 nonce text NOT NULL CHECK(nonce ~ '^[A-Za-z0-9_-]{43}$'),
 pkce_verifier text NOT NULL CHECK(pkce_verifier ~ '^[A-Za-z0-9_-]{43}$'),
 return_path text NOT NULL CHECK(return_path ~ '^/admin(/[A-Za-z0-9_-]+)*/?$'),
 require_mfa boolean NOT NULL DEFAULT false,
 previous_session_sha256 text CHECK(previous_session_sha256 IS NULL OR previous_session_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes'),
 PRIMARY KEY(publisher_id,state_sha256)
);
CREATE INDEX IF NOT EXISTS publisher_login_expiry ON ask_bill.publisher_login_transactions(publisher_id,expires_at);
CREATE TABLE IF NOT EXISTS ask_bill.publisher_auth_sessions (
 publisher_id uuid NOT NULL,
 session_sha256 text NOT NULL CHECK(session_sha256 ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL,
 identity_sha256 text NOT NULL CHECK(identity_sha256 ~ '^[a-f0-9]{64}$'),
 csrf_sha256 text NOT NULL CHECK(csrf_sha256 ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 mfa_verified_at timestamptz,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '30 minutes'),
 CHECK(mfa_verified_at IS NULL OR mfa_verified_at<=issued_at),
 PRIMARY KEY(publisher_id,session_sha256),
 FOREIGN KEY(publisher_id,user_id) REFERENCES ask_bill.publisher_memberships(publisher_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(publisher_id,identity_sha256) REFERENCES ask_bill.publisher_auth_identities(publisher_id,identity_sha256) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS publisher_auth_session_expiry ON ask_bill.publisher_auth_sessions(publisher_id,expires_at);
DO $policies$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['publisher_auth_identities','publisher_login_transactions','publisher_auth_sessions'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename=tbl AND policyname='publisher_scope') THEN
   EXECUTE format('CREATE POLICY publisher_scope ON ask_bill.%I FOR ALL USING(publisher_id=ask_bill.current_publisher_id()) WITH CHECK(publisher_id=ask_bill.current_publisher_id())',tbl);
  END IF;
  EXECUTE format('ALTER TABLE ask_bill.%I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE ask_bill.%I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON ask_bill.%I FROM PUBLIC',tbl);
 END LOOP;
END
$policies$;
COMMIT;
