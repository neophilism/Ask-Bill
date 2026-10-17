-- AB-034: transactionally bounded generation usage; anonymous reading is independent.
BEGIN;
ALTER TABLE ask_bill.usage_reservations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','settled','released'));
ALTER TABLE ask_bill.usage_reservations ADD COLUMN IF NOT EXISTS settled_at timestamptz;
CREATE TABLE IF NOT EXISTS ask_bill.usage_limits (
 publisher_id uuid PRIMARY KEY REFERENCES ask_bill.publishers(id) ON DELETE RESTRICT,
 global_limit bigint NOT NULL DEFAULT 0 CHECK(global_limit BETWEEN 0 AND 100000000),
 session_limit bigint NOT NULL DEFAULT 0 CHECK(session_limit BETWEEN 0 AND 100000000),
 generation_enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE ask_bill.usage_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.usage_limits FORCE ROW LEVEL SECURITY;
DO $policy$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='usage_limits' AND policyname='publisher_scope') THEN
 CREATE POLICY publisher_scope ON ask_bill.usage_limits FOR ALL
 USING (publisher_id=ask_bill.current_publisher_id()) WITH CHECK (publisher_id=ask_bill.current_publisher_id());
 END IF;
END $policy$;
-- Every reservation takes a row lock on the publisher ceiling, serializing concurrent requests.
CREATE OR REPLACE FUNCTION ask_bill.reserve_generation(p_publisher uuid,p_session uuid,p_key text,p_units bigint,p_expires timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE limits ask_bill.usage_limits%ROWTYPE; total bigint; in_session bigint; existing ask_bill.usage_reservations%ROWTYPE; result uuid;
BEGIN
 IF p_publisher IS DISTINCT FROM ask_bill.current_publisher_id() THEN RAISE EXCEPTION 'Wrong publisher' USING ERRCODE='42501'; END IF;
 IF p_units IS NULL OR p_units NOT BETWEEN 1 AND 1000000 OR p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 100 OR p_key !~ '^[A-Za-z0-9_-]+$'
 OR p_expires IS NULL OR p_expires<=clock_timestamp() OR p_expires>clock_timestamp()+interval '30 minutes' THEN
 RAISE EXCEPTION 'Invalid reservation request' USING ERRCODE='22023'; END IF;
 SELECT * INTO limits FROM ask_bill.usage_limits WHERE publisher_id=p_publisher FOR UPDATE;
 IF NOT FOUND OR NOT limits.generation_enabled THEN RAISE EXCEPTION 'Generation disabled' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM ask_bill.usage_reservations WHERE publisher_id=p_publisher AND reservation_key=p_key FOR UPDATE;
 IF FOUND THEN
  IF existing.session_id<>p_session OR existing.reserved_units<>p_units THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='23505'; END IF;
  RETURN existing.id;
 END IF;
 PERFORM 1 FROM ask_bill.sessions WHERE publisher_id=p_publisher AND id=p_session AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session missing or expired' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(SUM(CASE WHEN status='reserved' AND expires_at>clock_timestamp() THEN reserved_units WHEN status='settled' THEN settled_units ELSE 0 END),0)
 INTO total FROM ask_bill.usage_reservations WHERE publisher_id=p_publisher;
 SELECT COALESCE(SUM(CASE WHEN status='reserved' AND expires_at>clock_timestamp() THEN reserved_units WHEN status='settled' THEN settled_units ELSE 0 END),0)
 INTO in_session FROM ask_bill.usage_reservations WHERE publisher_id=p_publisher AND session_id=p_session;
 IF total+p_units>limits.global_limit OR in_session+p_units>limits.session_limit THEN RAISE EXCEPTION 'Quota exceeded' USING ERRCODE='54000'; END IF;
 INSERT INTO ask_bill.usage_reservations(publisher_id,session_id,reservation_key,reserved_units,expires_at,status)
 VALUES(p_publisher,p_session,p_key,p_units,p_expires,'reserved') RETURNING id INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION ask_bill.settle_generation(p_publisher uuid,p_reservation uuid,p_actual bigint,p_release boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE current_row ask_bill.usage_reservations%ROWTYPE;
BEGIN
 IF p_publisher IS DISTINCT FROM ask_bill.current_publisher_id() THEN RAISE EXCEPTION 'Wrong publisher' USING ERRCODE='42501'; END IF;
 IF p_actual IS NULL OR p_actual<0 OR p_release IS NULL THEN RAISE EXCEPTION 'Invalid usage settlement' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM ask_bill.usage_limits WHERE publisher_id=p_publisher FOR UPDATE;
 SELECT * INTO current_row FROM ask_bill.usage_reservations WHERE publisher_id=p_publisher AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF current_row.status<>'reserved' THEN
  IF (current_row.status='released' AND p_release) OR (current_row.status='settled' AND NOT p_release AND current_row.settled_units=p_actual) THEN RETURN true; END IF;
  RAISE EXCEPTION 'Conflicting settlement' USING ERRCODE='23505';
 END IF;
 IF p_actual>current_row.reserved_units THEN RAISE EXCEPTION 'Actual usage exceeds reservation' USING ERRCODE='22023'; END IF;
 UPDATE ask_bill.usage_reservations SET status=CASE WHEN p_release THEN 'released' ELSE 'settled' END,
 settled_units=CASE WHEN p_release THEN 0 ELSE p_actual END,settled_at=clock_timestamp()
 WHERE id=p_reservation AND publisher_id=p_publisher;
 RETURN true;
END $$;
COMMIT;
