-- AB-010 / Ask Bill: durable, tenant-scoped jobs and at-least-once outbox delivery.
-- Expand-only migration; apply under a privileged migration role after 001_initial.sql.
-- SECURITY INVOKER functions deliberately inherit their caller's FORCE RLS policy.
BEGIN;
ALTER TABLE ask_bill.jobs ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ask_bill.jobs ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 100);
ALTER TABLE ask_bill.jobs ADD COLUMN IF NOT EXISTS last_error_code text CHECK (last_error_code ~ '^[A-Z0-9_]{2,64}$');
ALTER TABLE ask_bill.jobs ADD COLUMN IF NOT EXISTS finished_at timestamptz;
CREATE INDEX IF NOT EXISTS jobs_available ON ask_bill.jobs (publisher_id, available_at, created_at)
 WHERE status IN ('queued','retry','leased');

ALTER TABLE ask_bill.outbox_events ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ask_bill.outbox_events ADD COLUMN IF NOT EXISTS lease_owner uuid;
ALTER TABLE ask_bill.outbox_events ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE ask_bill.outbox_events ADD COLUMN IF NOT EXISTS fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0);
ALTER TABLE ask_bill.outbox_events ADD COLUMN IF NOT EXISTS delivery_attempt integer NOT NULL DEFAULT 0 CHECK (delivery_attempt BETWEEN 0 AND 100);
ALTER TABLE ask_bill.outbox_events ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 100);
ALTER TABLE ask_bill.outbox_events ADD COLUMN IF NOT EXISTS last_error_code text CHECK (last_error_code ~ '^[A-Z0-9_]{2,64}$');
CREATE INDEX IF NOT EXISTS outbox_available ON ask_bill.outbox_events (publisher_id, available_at, created_at)
 WHERE status='pending';

CREATE OR REPLACE FUNCTION ask_bill.enqueue_job(p_publisher_id uuid, p_kind text, p_dedupe_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE result uuid;
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
   RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 INSERT INTO ask_bill.jobs(publisher_id,kind,dedupe_key)
 VALUES (p_publisher_id,p_kind,p_dedupe_key)
 ON CONFLICT (publisher_id,kind,dedupe_key) DO UPDATE SET kind=EXCLUDED.kind
 RETURNING id INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION ask_bill.claim_job(p_publisher_id uuid,p_worker_id uuid,p_lease_seconds integer)
RETURNS TABLE(job_id uuid,job_kind text,fence_version bigint,lease_expires timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
   RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 IF p_worker_id IS NULL OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
   RAISE EXCEPTION 'Invalid lease parameters' USING ERRCODE='22023';
 END IF;
 RETURN QUERY WITH candidate AS (
  SELECT id FROM ask_bill.jobs
  WHERE publisher_id=p_publisher_id AND available_at <= clock_timestamp()
    AND (status IN ('queued','retry') OR (status='leased' AND lease_until < clock_timestamp()))
    AND attempt < max_attempts
  ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE ask_bill.jobs j
 SET status='leased',lease_owner=p_worker_id,
     lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
     attempt=attempt+1,fence=fence+1,last_error_code=NULL
 FROM candidate c WHERE j.id=c.id AND j.publisher_id=p_publisher_id
 RETURNING j.id,j.kind,j.fence,j.lease_until;
END $$;

CREATE OR REPLACE FUNCTION ask_bill.heartbeat_job(p_publisher_id uuid,p_job_id uuid,p_worker_id uuid,p_fence bigint,p_lease_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 IF p_worker_id IS NULL OR p_fence IS NULL OR p_fence < 1 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
  RAISE EXCEPTION 'Invalid heartbeat parameters' USING ERRCODE='22023';
 END IF;
 UPDATE ask_bill.jobs SET lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds)
 WHERE publisher_id=p_publisher_id AND id=p_job_id AND lease_owner=p_worker_id
   AND fence=p_fence AND status='leased' AND lease_until>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION ask_bill.complete_job_and_enqueue(
 p_publisher_id uuid,p_job_id uuid,p_worker_id uuid,p_fence bigint,
 p_event_type text,p_event_key text,p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR
    p_event_type IS NULL OR length(p_event_type) NOT BETWEEN 1 AND 100 OR
    p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 150 THEN
  RAISE EXCEPTION 'Invalid outbox event' USING ERRCODE='22023';
 END IF;
 UPDATE ask_bill.jobs
 SET status='completed',lease_owner=NULL,lease_until=NULL,finished_at=clock_timestamp()
 WHERE publisher_id=p_publisher_id AND id=p_job_id AND lease_owner=p_worker_id AND fence=p_fence
   AND status='leased' AND lease_until>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RETURN false; END IF;
 -- Same transaction: any insert/check error rolls back the job completion too.
 INSERT INTO ask_bill.outbox_events(publisher_id,event_type,idempotency_key,payload)
 VALUES(p_publisher_id,p_event_type,p_event_key,p_payload)
 ON CONFLICT(publisher_id,idempotency_key) DO NOTHING;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION ask_bill.fail_job(
 p_publisher_id uuid,p_job_id uuid,p_worker_id uuid,p_fence bigint,p_retry boolean,p_error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 IF p_error_code IS NULL OR p_error_code !~ '^[A-Z0-9_]{2,64}$' THEN
  RAISE EXCEPTION 'Invalid diagnostic code' USING ERRCODE='22023';
 END IF;
 UPDATE ask_bill.jobs SET
  status=CASE WHEN p_retry IS TRUE AND attempt<max_attempts THEN 'retry' ELSE 'dead' END,
  available_at=clock_timestamp()+make_interval(secs=>least(300, (power(2,least(attempt,8)))::integer)),
  last_error_code=p_error_code,lease_owner=NULL,lease_until=NULL,
  finished_at=CASE WHEN p_retry IS TRUE AND attempt<max_attempts THEN NULL ELSE clock_timestamp() END
 WHERE publisher_id=p_publisher_id AND id=p_job_id AND lease_owner=p_worker_id
  AND fence=p_fence AND status='leased' AND lease_until>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION ask_bill.reap_expired_jobs(p_publisher_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 UPDATE ask_bill.jobs SET
  status=CASE WHEN attempt < max_attempts THEN 'retry' ELSE 'dead' END,
  available_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL,
  last_error_code='LEASE_EXPIRED',
  finished_at=CASE WHEN attempt<max_attempts THEN NULL ELSE clock_timestamp() END
 WHERE publisher_id=p_publisher_id AND status='leased' AND lease_until<clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;

-- The outbox provides AT-LEAST-ONCE external delivery. Consumers must honor
-- idempotency_key; a network crash after delivery but before ack causes replay.
CREATE OR REPLACE FUNCTION ask_bill.claim_outbox(p_publisher_id uuid,p_worker_id uuid,p_lease_seconds integer)
RETURNS TABLE(event_id uuid,event_type text,idempotency_key text,event_payload jsonb,fence_version bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 IF p_worker_id IS NULL OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
  RAISE EXCEPTION 'Invalid lease parameters' USING ERRCODE='22023';
 END IF;
 RETURN QUERY WITH candidate AS (
  SELECT id FROM ask_bill.outbox_events WHERE publisher_id=p_publisher_id AND status='pending'
    AND available_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp())
    AND delivery_attempt<max_attempts
  ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE ask_bill.outbox_events e SET
  lease_owner=p_worker_id,lease_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
  fence=e.fence+1,delivery_attempt=e.delivery_attempt+1,last_error_code=NULL
 FROM candidate c WHERE e.id=c.id AND e.publisher_id=p_publisher_id
 RETURNING e.id,e.event_type,e.idempotency_key,e.payload,e.fence;
END $$;

CREATE OR REPLACE FUNCTION ask_bill.ack_outbox(p_publisher_id uuid,p_event_id uuid,p_worker_id uuid,p_fence bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 UPDATE ask_bill.outbox_events SET status='delivered',delivered_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL
 WHERE publisher_id=p_publisher_id AND id=p_event_id AND lease_owner=p_worker_id AND fence=p_fence
   AND status='pending' AND lease_until>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION ask_bill.fail_outbox(
 p_publisher_id uuid,p_event_id uuid,p_worker_id uuid,p_fence bigint,p_retry boolean,p_error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 IF p_error_code IS NULL OR p_error_code !~ '^[A-Z0-9_]{2,64}$' THEN
  RAISE EXCEPTION 'Invalid diagnostic code' USING ERRCODE='22023';
 END IF;
 UPDATE ask_bill.outbox_events SET
  status=CASE WHEN p_retry IS TRUE AND delivery_attempt<max_attempts THEN 'pending' ELSE 'failed' END,
  available_at=clock_timestamp()+make_interval(secs=>least(300,(power(2,least(delivery_attempt,8)))::integer)),
  last_error_code=p_error_code,lease_owner=NULL,lease_until=NULL
 WHERE publisher_id=p_publisher_id AND id=p_event_id AND lease_owner=p_worker_id AND fence=p_fence
   AND status='pending' AND lease_until>clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION ask_bill.reap_expired_outbox(p_publisher_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF p_publisher_id IS DISTINCT FROM ask_bill.current_publisher_id() THEN
  RAISE EXCEPTION 'Publisher context mismatch' USING ERRCODE='42501';
 END IF;
 UPDATE ask_bill.outbox_events SET
  status=CASE WHEN delivery_attempt < max_attempts THEN 'pending' ELSE 'failed' END,
  lease_owner=NULL,lease_until=NULL,last_error_code='LEASE_EXPIRED',available_at=clock_timestamp()
 WHERE publisher_id=p_publisher_id AND status='pending' AND lease_until<clock_timestamp();
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;

REVOKE ALL ON FUNCTION ask_bill.enqueue_job(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.claim_job(uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.heartbeat_job(uuid,uuid,uuid,bigint,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.complete_job_and_enqueue(uuid,uuid,uuid,bigint,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.fail_job(uuid,uuid,uuid,bigint,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.reap_expired_jobs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.claim_outbox(uuid,uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.ack_outbox(uuid,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.fail_outbox(uuid,uuid,uuid,bigint,boolean,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ask_bill.reap_expired_outbox(uuid) FROM PUBLIC;
COMMIT;
