-- Ask Bill durable private intake, review and verified same-origin publication packs.
-- Expand-only; apply after 001-008. Raw uploads remain in private object storage.
BEGIN;
CREATE TABLE IF NOT EXISTS ask_bill.publisher_source_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  job_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  target_version_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('upload','congress')),
  language text NOT NULL CHECK (language IN ('en','es')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=8192),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','processing','completed','failed')),
  version_id uuid,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(source_metadata::text)<=8192),
  error_code text CHECK (error_code ~ '^[A-Z0-9_]{2,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (publisher_id,bill_id) REFERENCES ask_bill.bills(publisher_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (publisher_id,job_id) REFERENCES ask_bill.jobs(publisher_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (publisher_id,version_id) REFERENCES ask_bill.bill_versions(publisher_id,id) ON DELETE RESTRICT,
  CHECK ((state='completed') = (version_id IS NOT NULL AND completed_at IS NOT NULL)),
  UNIQUE (publisher_id,job_id),
  UNIQUE (publisher_id,target_version_id)
);
CREATE INDEX IF NOT EXISTS publisher_requests_by_bill ON ask_bill.publisher_source_requests(publisher_id,bill_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ask_bill.publisher_version_extractions (
  publisher_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  version_id uuid NOT NULL,
  source_object_id uuid NOT NULL,
  canonical_text text NOT NULL CHECK (octet_length(canonical_text) BETWEEN 1 AND 1500000),
  canonical_sha256 text NOT NULL CHECK (canonical_sha256 ~ '^[a-f0-9]{64}$'),
  parser_version text NOT NULL CHECK (parser_version ~ '^[a-zA-Z0-9._-]{1,64}$'),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(warnings)='array' AND jsonb_array_length(warnings)<=64),
  previous_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (publisher_id,version_id),
  FOREIGN KEY (publisher_id,bill_id,version_id) REFERENCES ask_bill.bill_versions(publisher_id,bill_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (publisher_id,source_object_id) REFERENCES ask_bill.source_objects(publisher_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (publisher_id,previous_version_id) REFERENCES ask_bill.bill_versions(publisher_id,id) ON DELETE RESTRICT,
  CHECK (canonical_sha256=encode(sha256(convert_to(canonical_text,'UTF8')),'hex'))
);

CREATE TABLE IF NOT EXISTS ask_bill.publisher_version_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL,
  version_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  canonical_sha256 text NOT NULL CHECK (canonical_sha256 ~ '^[a-f0-9]{64}$'),
  raw_sha256 text NOT NULL CHECK (raw_sha256 ~ '^[a-f0-9]{64}$'),
  checks jsonb NOT NULL CHECK (jsonb_typeof(checks)='array' AND jsonb_array_length(checks)=6 AND
    checks ?& ARRAY['source_complete','extraction_verified','citations_exact','exceptions_reviewed','index_complete','rights_verified']),
  review_sha256 text NOT NULL CHECK (review_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (publisher_id,version_id) REFERENCES ask_bill.bill_versions(publisher_id,id) ON DELETE RESTRICT,
  UNIQUE (publisher_id,version_id,review_sha256)
);
CREATE INDEX IF NOT EXISTS publisher_reviews_by_version ON ask_bill.publisher_version_reviews(publisher_id,version_id,created_at DESC);

-- This is an actual durable public-pack backing store. The public endpoint must
-- still resolve an active reviewed release; knowledge of a pack hash grants no access.
CREATE TABLE IF NOT EXISTS ask_bill.publisher_public_packs (
  publisher_id uuid NOT NULL,
  version_id uuid NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  pack_bytes bytea NOT NULL CHECK (octet_length(pack_bytes) BETWEEN 1 AND 6000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (publisher_id,version_id,sha256),
  FOREIGN KEY (publisher_id,version_id) REFERENCES ask_bill.bill_versions(publisher_id,id) ON DELETE RESTRICT,
  CHECK (sha256=encode(sha256(pack_bytes),'hex'))
);

-- SELECT FOR SHARE itself requires UPDATE privilege. The runtime must never be
-- allowed to grant membership roles, so expose only this scoped lock/read function.
-- Its trusted owner can lock the row; no caller-supplied SQL or mutation is possible.
CREATE OR REPLACE FUNCTION ask_bill.lock_publisher_membership(p_publisher uuid,p_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE membership_role text;
BEGIN
  IF p_publisher IS DISTINCT FROM ask_bill.current_publisher_id() THEN
    RAISE EXCEPTION 'Publisher scope required' USING ERRCODE='42501';
  END IF;
  SELECT role INTO membership_role FROM ask_bill.publisher_memberships
    WHERE publisher_id=p_publisher AND user_id=p_user FOR SHARE;
  RETURN membership_role;
END $$;
REVOKE ALL ON FUNCTION ask_bill.lock_publisher_membership(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ask_bill.reject_publisher_record_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Publisher extraction, review and pack records are immutable' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION ask_bill.reject_publisher_record_change() FROM PUBLIC;
DO $workflow$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['publisher_source_requests','publisher_version_extractions','publisher_version_reviews','publisher_public_packs'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename=tbl AND policyname='publisher_scope') THEN
      EXECUTE format('CREATE POLICY publisher_scope ON ask_bill.%I FOR ALL USING (publisher_id=ask_bill.current_publisher_id()) WITH CHECK (publisher_id=ask_bill.current_publisher_id())',tbl);
    END IF;
    EXECUTE format('ALTER TABLE ask_bill.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('ALTER TABLE ask_bill.%I FORCE ROW LEVEL SECURITY',tbl);
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['publisher_version_extractions','publisher_version_reviews','publisher_public_packs'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=tbl||'_immutable' AND tgrelid=('ask_bill.'||tbl)::regclass) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON ask_bill.%I FOR EACH ROW EXECUTE FUNCTION ask_bill.reject_publisher_record_change()',tbl||'_immutable',tbl);
    END IF;
  END LOOP;
END
$workflow$;
COMMIT;
