-- AB-023 — Ask Bill tenant/version scoped immutable lexical index generations.
-- Apply only after 001-003. No destructive DDL or index activation during migration.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='provisions_tenant_version_id_unique' AND conrelid='ask_bill.provisions'::regclass) THEN
  ALTER TABLE ask_bill.provisions ADD CONSTRAINT provisions_tenant_version_id_unique UNIQUE(publisher_id,version_id,id);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS ask_bill.search_generations (
 id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
 publisher_id uuid NOT NULL,
 version_id uuid NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 index_sha256 text NOT NULL CHECK(index_sha256 ~ '^[a-f0-9]{64}$'),
 expected_entries integer NOT NULL CHECK(expected_entries BETWEEN 1 AND 20000),
 status text NOT NULL DEFAULT 'building' CHECK(status IN ('building','complete','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 FOREIGN KEY (publisher_id,version_id) REFERENCES ask_bill.bill_versions(publisher_id,id),
 UNIQUE(publisher_id,version_id,id)
);
CREATE INDEX IF NOT EXISTS search_generations_by_version ON ask_bill.search_generations(publisher_id,version_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ask_bill.search_entries (
 publisher_id uuid NOT NULL,
 version_id uuid NOT NULL,
 generation_id uuid NOT NULL,
 provision_id uuid NOT NULL,
 canonical_text text NOT NULL CHECK(length(canonical_text) BETWEEN 1 AND 500000),
 text_sha256 text NOT NULL CHECK(text_sha256 ~ '^[a-f0-9]{64}$'),
 search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english',canonical_text)) STORED,
 FOREIGN KEY (publisher_id,version_id,generation_id) REFERENCES ask_bill.search_generations(publisher_id,version_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (publisher_id,version_id,provision_id) REFERENCES ask_bill.provisions(publisher_id,version_id,id) ON DELETE RESTRICT,
 PRIMARY KEY(publisher_id,version_id,generation_id,provision_id)
);
CREATE INDEX IF NOT EXISTS search_entries_fts ON ask_bill.search_entries USING GIN(search_vector);
CREATE TABLE IF NOT EXISTS ask_bill.search_active (
 publisher_id uuid NOT NULL,
 version_id uuid NOT NULL,
 generation_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 activated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (publisher_id,version_id,generation_id) REFERENCES ask_bill.search_generations(publisher_id,version_id,id),
 PRIMARY KEY(publisher_id,version_id)
);
CREATE OR REPLACE FUNCTION ask_bill.guard_search_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE status_now text; original text;
BEGIN
 SELECT status INTO status_now FROM ask_bill.search_generations
  WHERE publisher_id=COALESCE(NEW.publisher_id,OLD.publisher_id)
    AND version_id=COALESCE(NEW.version_id,OLD.version_id)
    AND id=COALESCE(NEW.generation_id,OLD.generation_id) FOR UPDATE;
 IF status_now IS DISTINCT FROM 'building' THEN
  RAISE EXCEPTION 'Search generation is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP <> 'DELETE' THEN
  SELECT canonical_text INTO original FROM ask_bill.provisions
   WHERE publisher_id=NEW.publisher_id AND version_id=NEW.version_id AND id=NEW.provision_id;
  IF original IS NULL OR original<>NEW.canonical_text OR
     encode(sha256(convert_to(NEW.canonical_text,'UTF8')),'hex')<>NEW.text_sha256 THEN
   RAISE EXCEPTION 'Search entry must match exact source' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE OR REPLACE FUNCTION ask_bill.guard_search_generation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE actual integer;
BEGIN
 IF OLD.status<>'building' OR NEW.status NOT IN ('complete','failed') OR
    (to_jsonb(NEW)-'status'-'completed_at')<>(to_jsonb(OLD)-'status'-'completed_at') THEN
   RAISE EXCEPTION 'Search generation state is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.status='complete' THEN
  SELECT count(*) INTO actual FROM ask_bill.search_entries
   WHERE publisher_id=NEW.publisher_id AND version_id=NEW.version_id AND generation_id=NEW.id;
  IF actual<>NEW.expected_entries THEN
   RAISE EXCEPTION 'Search generation has incomplete members' USING ERRCODE='23514';
  END IF;
  NEW.completed_at:=now();
 ELSE
  NEW.completed_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='search_entry_guard' AND tgrelid='ask_bill.search_entries'::regclass) THEN
  CREATE TRIGGER search_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON ask_bill.search_entries
   FOR EACH ROW EXECUTE FUNCTION ask_bill.guard_search_entry();
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='search_generation_guard' AND tgrelid='ask_bill.search_generations'::regclass) THEN
  CREATE TRIGGER search_generation_guard BEFORE UPDATE ON ask_bill.search_generations
   FOR EACH ROW EXECUTE FUNCTION ask_bill.guard_search_generation();
 END IF;
END $$;
CREATE OR REPLACE FUNCTION ask_bill.activate_search_generation(p_publisher uuid,p_version uuid,p_generation uuid,p_expected_previous uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE previous uuid; expected_count integer; source_digest text; actual_count integer;
BEGIN
 IF ask_bill.current_publisher_id() IS DISTINCT FROM p_publisher THEN
  RAISE EXCEPTION 'Publisher scope required' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_publisher::text||':'||p_version::text,0));
 SELECT generation_id INTO previous FROM ask_bill.search_active
 WHERE publisher_id=p_publisher AND version_id=p_version FOR UPDATE;
 IF previous IS DISTINCT FROM p_expected_previous THEN RETURN false; END IF;
 SELECT expected_entries,source_sha256 INTO expected_count,source_digest FROM ask_bill.search_generations
  WHERE publisher_id=p_publisher AND version_id=p_version AND id=p_generation AND status='complete';
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM ask_bill.bill_versions WHERE publisher_id=p_publisher AND id=p_version AND canonical_text_sha256=source_digest) THEN RETURN false; END IF;
 SELECT count(*) INTO actual_count FROM ask_bill.search_entries e
 JOIN ask_bill.provisions p ON p.publisher_id=e.publisher_id AND p.version_id=e.version_id AND p.id=e.provision_id
 WHERE e.publisher_id=p_publisher AND e.version_id=p_version AND e.generation_id=p_generation
 AND e.canonical_text=p.canonical_text
 AND e.text_sha256=encode(sha256(convert_to(p.canonical_text,'UTF8')),'hex');
 IF actual_count<>expected_count THEN RETURN false; END IF;
 INSERT INTO ask_bill.search_active(publisher_id,version_id,generation_id) VALUES(p_publisher,p_version,p_generation)
 ON CONFLICT (publisher_id,version_id) DO UPDATE SET generation_id=EXCLUDED.generation_id,
  activated_at=now(),revision=ask_bill.search_active.revision+1;
 RETURN true;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='search_generations' AND policyname='publisher_scope') THEN
  CREATE POLICY publisher_scope ON ask_bill.search_generations FOR ALL USING(publisher_id=ask_bill.current_publisher_id()) WITH CHECK(publisher_id=ask_bill.current_publisher_id());
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='search_entries' AND policyname='publisher_scope') THEN
  CREATE POLICY publisher_scope ON ask_bill.search_entries FOR ALL USING(publisher_id=ask_bill.current_publisher_id()) WITH CHECK(publisher_id=ask_bill.current_publisher_id());
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='search_active' AND policyname='publisher_scope') THEN
  CREATE POLICY publisher_scope ON ask_bill.search_active FOR ALL USING(publisher_id=ask_bill.current_publisher_id()) WITH CHECK(publisher_id=ask_bill.current_publisher_id());
 END IF;
END $$;
ALTER TABLE ask_bill.search_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.search_generations FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.search_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.search_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.search_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.search_active FORCE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION ask_bill.activate_search_generation(uuid,uuid,uuid,uuid) FROM PUBLIC;
COMMIT;
