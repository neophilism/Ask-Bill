-- Ask Bill AB-013: append-only, tenant-bound original-source metadata; no source bytes stored in DB.
-- Apply after 001_initial and 002_jobs; safe to run twice.
BEGIN;
CREATE TABLE IF NOT EXISTS ask_bill.source_objects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length BETWEEN 1 AND 26214400),
  mime_type text NOT NULL CHECK (mime_type IN ('text/plain','text/markdown','application/xml','text/xml','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_key = publisher_id::text || '/sha256/' || sha256),
  UNIQUE (publisher_id, sha256),
  UNIQUE (publisher_id, id)
);
CREATE INDEX IF NOT EXISTS source_objects_by_publisher ON ask_bill.source_objects(publisher_id,created_at);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='version_tenant_bill_revision_unique' AND conrelid='ask_bill.bill_versions'::regclass) THEN
  ALTER TABLE ask_bill.bill_versions ADD CONSTRAINT version_tenant_bill_revision_unique UNIQUE(publisher_id,bill_id,id);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS ask_bill.source_import_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
  bill_id uuid NOT NULL,
  version_id uuid NOT NULL,
  source_object_id uuid NOT NULL,
  origin text NOT NULL CHECK (origin IN ('official','publisher-upload')),
  source_url text,
  retrieved_at timestamptz NOT NULL,
  canonicalization_version text NOT NULL CHECK (canonicalization_version ~ '^[a-zA-Z0-9._-]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((origin='publisher-upload' AND source_url IS NULL) OR (origin='official' AND source_url LIKE 'https://%')),
  FOREIGN KEY (publisher_id,bill_id,version_id) REFERENCES ask_bill.bill_versions(publisher_id,bill_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (publisher_id,source_object_id) REFERENCES ask_bill.source_objects(publisher_id,id) ON DELETE RESTRICT,
  UNIQUE (publisher_id,version_id,source_object_id)
);
CREATE INDEX IF NOT EXISTS source_events_by_version ON ask_bill.source_import_events(publisher_id,version_id,retrieved_at DESC);

CREATE OR REPLACE FUNCTION ask_bill.reject_source_metadata_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'Source provenance metadata is immutable; create a new event/version instead' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION ask_bill.reject_source_metadata_update() FROM PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='source_object_immutable' AND tgrelid='ask_bill.source_objects'::regclass) THEN
  CREATE TRIGGER source_object_immutable BEFORE UPDATE ON ask_bill.source_objects FOR EACH ROW EXECUTE FUNCTION ask_bill.reject_source_metadata_update();
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='source_event_immutable' AND tgrelid='ask_bill.source_import_events'::regclass) THEN
  CREATE TRIGGER source_event_immutable BEFORE UPDATE ON ask_bill.source_import_events FOR EACH ROW EXECUTE FUNCTION ask_bill.reject_source_metadata_update();
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='source_objects' AND policyname='publisher_scope') THEN
  CREATE POLICY publisher_scope ON ask_bill.source_objects FOR ALL USING (publisher_id=ask_bill.current_publisher_id()) WITH CHECK (publisher_id=ask_bill.current_publisher_id());
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='source_import_events' AND policyname='publisher_scope') THEN
  CREATE POLICY publisher_scope ON ask_bill.source_import_events FOR ALL USING (publisher_id=ask_bill.current_publisher_id()) WITH CHECK (publisher_id=ask_bill.current_publisher_id());
 END IF;
END $$;
ALTER TABLE ask_bill.source_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.source_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.source_import_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.source_import_events FORCE ROW LEVEL SECURITY;
COMMIT;
