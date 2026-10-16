-- Ask Bill independent tenant-scoped foundation, migration AB-007.
-- PostgreSQL 17; intentionally non-destructive, repeatable and fail-closed.
BEGIN;
CREATE SCHEMA IF NOT EXISTS ask_bill;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION ask_bill.current_publisher_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('ask_bill.publisher_id', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS ask_bill.publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ask_bill.publisher_memberships (
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (publisher_id, user_id)
);

CREATE TABLE IF NOT EXISTS ask_bill.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
  external_ref text,
  jurisdiction text NOT NULL CHECK (length(jurisdiction) BETWEEN 2 AND 100),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publisher_id, id)
);
CREATE INDEX IF NOT EXISTS bills_by_publisher ON ask_bill.bills (publisher_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ask_bill.bill_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  language text NOT NULL CHECK (length(language) BETWEEN 2 AND 35),
  status text NOT NULL CHECK (status IN ('draft','introduced','amended','passed_one_chamber','enacted','effective','repealed','unknown')),
  raw_byte_sha256 text NOT NULL CHECK (raw_byte_sha256 ~ '^[a-f0-9]{64}$'),
  canonical_text_sha256 text NOT NULL CHECK (canonical_text_sha256 ~ '^[a-f0-9]{64}$'),
  canonicalization_version text NOT NULL,
  source_complete boolean NOT NULL DEFAULT false,
  publication text NOT NULL DEFAULT 'private' CHECK (publication IN ('private','reviewed','published','withdrawn')),
  retrieved_at timestamptz NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (publication <> 'published' OR (source_complete AND published_at IS NOT NULL)),
  FOREIGN KEY (publisher_id, bill_id) REFERENCES ask_bill.bills(publisher_id, id) ON DELETE RESTRICT,
  UNIQUE (publisher_id, id)
);
CREATE INDEX IF NOT EXISTS versions_by_bill ON ask_bill.bill_versions (publisher_id, bill_id, created_at DESC);
CREATE INDEX IF NOT EXISTS published_versions ON ask_bill.bill_versions (publisher_id, bill_id, published_at DESC) WHERE publication = 'published';

CREATE TABLE IF NOT EXISTS ask_bill.provisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL,
  version_id uuid NOT NULL,
  provision_path text NOT NULL CHECK (length(provision_path) BETWEEN 1 AND 300),
  heading text NOT NULL DEFAULT '',
  canonical_text text NOT NULL CHECK (length(canonical_text) BETWEEN 1 AND 500000),
  original_locator jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (publisher_id, version_id) REFERENCES ask_bill.bill_versions(publisher_id, id) ON DELETE RESTRICT,
  UNIQUE (publisher_id, version_id, provision_path),
  UNIQUE (publisher_id, id)
);
CREATE INDEX IF NOT EXISTS provisions_by_version ON ask_bill.provisions (publisher_id, version_id);

CREATE TABLE IF NOT EXISTS ask_bill.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL,
  capability_sha256 text NOT NULL CHECK (capability_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  FOREIGN KEY (publisher_id, version_id) REFERENCES ask_bill.bill_versions(publisher_id, id),
  CHECK (expires_at > created_at),
  UNIQUE (publisher_id, id)
);
CREATE INDEX IF NOT EXISTS expired_sessions ON ask_bill.sessions (expires_at);

CREATE TABLE IF NOT EXISTS ask_bill.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 80),
  dedupe_key text NOT NULL CHECK (length(dedupe_key) BETWEEN 1 AND 150),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','leased','retry','completed','dead')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 100),
  lease_owner uuid,
  lease_until timestamptz,
  fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publisher_id, kind, dedupe_key),
  UNIQUE (publisher_id, id)
);
CREATE INDEX IF NOT EXISTS jobs_ready ON ask_bill.jobs (publisher_id, status, lease_until) WHERE status IN ('queued','retry','leased');

CREATE TABLE IF NOT EXISTS ask_bill.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 150),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (publisher_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS pending_outbox ON ask_bill.outbox_events (publisher_id, created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS ask_bill.usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL,
  session_id uuid NOT NULL,
  reservation_key text NOT NULL CHECK (length(reservation_key) BETWEEN 1 AND 150),
  reserved_units bigint NOT NULL CHECK (reserved_units >= 0),
  settled_units bigint CHECK (settled_units >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (publisher_id, session_id) REFERENCES ask_bill.sessions(publisher_id, id),
  UNIQUE (publisher_id, reservation_key)
);
CREATE INDEX IF NOT EXISTS usage_reservations_expiry ON ask_bill.usage_reservations (publisher_id, expires_at);

CREATE TABLE IF NOT EXISTS ask_bill.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
  actor_user_id uuid,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  target_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_by_publisher ON ask_bill.audit_events (publisher_id, occurred_at DESC);

-- Tenant ID comes solely from the authenticated, trusted API transaction.
-- Caller-controlled IDs and direct SQL access are never authorization mechanisms.
DO $policy$
DECLARE tbl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='publishers' AND policyname='publisher_scope') THEN
    EXECUTE 'CREATE POLICY publisher_scope ON ask_bill.publishers FOR ALL USING (id = ask_bill.current_publisher_id()) WITH CHECK (id = ask_bill.current_publisher_id())';
  END IF;
  FOREACH tbl IN ARRAY ARRAY['publisher_memberships','bills','bill_versions','provisions','sessions','jobs','outbox_events','usage_reservations','audit_events'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename=tbl AND policyname='publisher_scope') THEN
      EXECUTE format('CREATE POLICY publisher_scope ON ask_bill.%I FOR ALL USING (publisher_id = ask_bill.current_publisher_id()) WITH CHECK (publisher_id = ask_bill.current_publisher_id())',tbl);
    END IF;
  END LOOP;
END
$policy$;
ALTER TABLE ask_bill.publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.publishers FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.publisher_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.publisher_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.bills FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.bill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.bill_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.provisions FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.usage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.usage_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.audit_events FORCE ROW LEVEL SECURITY;
COMMIT;
