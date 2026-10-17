-- Ask Bill AB-024: isolated, immutable reviewed release records and transactional publication.
-- Apply only after 001-004; publishing remains disabled until a trusted admin adapter is configured.
BEGIN;
CREATE TABLE IF NOT EXISTS ask_bill.release_packs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
 bill_id uuid NOT NULL,
 version_id uuid NOT NULL,
 generation_id uuid NOT NULL,
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[a-f0-9]{64}$'),
 canonical_sha256 text NOT NULL CHECK(canonical_sha256 ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[a-f0-9]{64}$'),
 reviewed_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(publisher_id,bill_id,version_id) REFERENCES ask_bill.bill_versions(publisher_id,bill_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(publisher_id,version_id,generation_id) REFERENCES ask_bill.search_generations(publisher_id,version_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(publisher_id,reviewed_by) REFERENCES ask_bill.publisher_memberships(publisher_id,user_id) ON DELETE RESTRICT,
 UNIQUE(publisher_id,id)
);
CREATE INDEX IF NOT EXISTS release_packs_by_version ON ask_bill.release_packs(publisher_id,version_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ask_bill.release_active (
 publisher_id uuid NOT NULL,
 bill_id uuid NOT NULL,
 release_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 activated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(publisher_id,bill_id),
 FOREIGN KEY(publisher_id,bill_id) REFERENCES ask_bill.bills(publisher_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(publisher_id,release_id) REFERENCES ask_bill.release_packs(publisher_id,id) ON DELETE RESTRICT
);
CREATE OR REPLACE FUNCTION ask_bill.reject_release_pack_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'Released pack metadata cannot be altered; create a new immutable record' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION ask_bill.reject_release_pack_change() FROM PUBLIC;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='release_pack_immutable' AND tgrelid='ask_bill.release_packs'::regclass) THEN
  CREATE TRIGGER release_pack_immutable BEFORE UPDATE OR DELETE ON ask_bill.release_packs
   FOR EACH ROW EXECUTE FUNCTION ask_bill.reject_release_pack_change();
 END IF;
END $$;
-- The backend must authenticate the actor with recent MFA and pass this to its dedicated DB role.
-- This SECURITY INVOKER function rechecks fresh publisher membership and the current content/index state.
CREATE OR REPLACE FUNCTION ask_bill.activate_reviewed_release(
 p_publisher uuid,p_bill uuid,p_release uuid,p_previous uuid,p_actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rp ask_bill.release_packs%ROWTYPE; old_release uuid; v ask_bill.bill_versions%ROWTYPE;
BEGIN
 IF p_publisher IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher scope required' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM ask_bill.publisher_memberships
   WHERE publisher_id=p_publisher AND user_id=p_actor AND role IN ('owner','editor')) THEN
  RAISE EXCEPTION 'Publisher review permission required' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_publisher::text||':'||p_bill::text,0));
 SELECT release_id INTO old_release FROM ask_bill.release_active
  WHERE publisher_id=p_publisher AND bill_id=p_bill FOR UPDATE;
 IF old_release IS DISTINCT FROM p_previous THEN RETURN false; END IF;
 SELECT * INTO rp FROM ask_bill.release_packs WHERE publisher_id=p_publisher AND bill_id=p_bill AND id=p_release;
 IF NOT FOUND OR rp.reviewed_by IS DISTINCT FROM p_actor THEN RETURN false; END IF;
 SELECT * INTO v FROM ask_bill.bill_versions
   WHERE publisher_id=p_publisher AND bill_id=p_bill AND id=rp.version_id FOR UPDATE;
 IF NOT FOUND OR v.source_complete IS DISTINCT FROM true OR
   v.publication NOT IN ('reviewed','published') OR
   v.raw_byte_sha256 IS DISTINCT FROM rp.original_sha256 OR
   v.canonical_text_sha256 IS DISTINCT FROM rp.canonical_sha256 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM ask_bill.source_import_events e
   JOIN ask_bill.source_objects s ON s.publisher_id=e.publisher_id AND s.id=e.source_object_id
   WHERE e.publisher_id=p_publisher AND e.version_id=rp.version_id AND s.sha256=rp.original_sha256) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM ask_bill.search_generations g
   JOIN ask_bill.search_active a ON a.publisher_id=g.publisher_id AND a.version_id=g.version_id AND a.generation_id=g.id
   WHERE g.publisher_id=p_publisher AND g.version_id=rp.version_id AND g.id=rp.generation_id
     AND g.status='complete' AND g.source_sha256=rp.canonical_sha256) THEN RETURN false; END IF;
 UPDATE ask_bill.bill_versions SET publication='published',published_at=COALESCE(published_at,clock_timestamp())
  WHERE publisher_id=p_publisher AND bill_id=p_bill AND id=rp.version_id;
 INSERT INTO ask_bill.release_active(publisher_id,bill_id,release_id) VALUES(p_publisher,p_bill,p_release)
 ON CONFLICT(publisher_id,bill_id) DO UPDATE
  SET release_id=EXCLUDED.release_id,revision=ask_bill.release_active.revision+1,activated_at=clock_timestamp();
 INSERT INTO ask_bill.outbox_events(publisher_id,event_type,idempotency_key,payload)
  VALUES(p_publisher,'release.published','publish-'||p_release::text,jsonb_build_object('billId',p_bill,'versionId',rp.version_id,'releaseId',p_release))
 ON CONFLICT(publisher_id,idempotency_key) DO NOTHING;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION ask_bill.withdraw_reviewed_release(p_publisher uuid,p_bill uuid,p_release uuid,p_actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE old_release uuid; version_id uuid;
BEGIN
 IF p_publisher IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher scope required' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM ask_bill.publisher_memberships
   WHERE publisher_id=p_publisher AND user_id=p_actor AND role='owner') THEN
  RAISE EXCEPTION 'Owner required to withdraw' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_publisher::text||':'||p_bill::text,0));
 SELECT release_id INTO old_release FROM ask_bill.release_active
   WHERE publisher_id=p_publisher AND bill_id=p_bill FOR UPDATE;
 IF old_release IS DISTINCT FROM p_release THEN RETURN false; END IF;
 SELECT version_id INTO version_id FROM ask_bill.release_packs
   WHERE publisher_id=p_publisher AND bill_id=p_bill AND id=p_release;
 DELETE FROM ask_bill.release_active WHERE publisher_id=p_publisher AND bill_id=p_bill AND release_id=p_release;
 UPDATE ask_bill.bill_versions SET publication='withdrawn'
   WHERE publisher_id=p_publisher AND bill_id=p_bill AND id=version_id;
 INSERT INTO ask_bill.outbox_events(publisher_id,event_type,idempotency_key,payload)
   VALUES(p_publisher,'release.withdrawn','withdraw-'||p_release::text,jsonb_build_object('billId',p_bill,'releaseId',p_release))
 ON CONFLICT(publisher_id,idempotency_key) DO NOTHING;
 RETURN true;
END $$;
DO $policies$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='release_packs' AND policyname='publisher_scope') THEN
  CREATE POLICY publisher_scope ON ask_bill.release_packs FOR ALL
    USING(publisher_id=ask_bill.current_publisher_id()) WITH CHECK(publisher_id=ask_bill.current_publisher_id());
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='release_active' AND policyname='publisher_scope') THEN
  CREATE POLICY publisher_scope ON ask_bill.release_active FOR ALL
    USING(publisher_id=ask_bill.current_publisher_id()) WITH CHECK(publisher_id=ask_bill.current_publisher_id());
 END IF;
END $policies$;
ALTER TABLE ask_bill.release_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.release_packs FORCE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.release_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.release_active FORCE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION ask_bill.activate_reviewed_release(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.withdraw_reviewed_release(uuid,uuid,uuid,uuid) FROM PUBLIC;
COMMIT;
