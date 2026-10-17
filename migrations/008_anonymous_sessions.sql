BEGIN;
CREATE TABLE IF NOT EXISTS ask_bill.anonymous_sessions (
  id uuid PRIMARY KEY,
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id),
  token_sha256 text NOT NULL CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
  csrf_sha256 text NOT NULL CHECK(csrf_sha256 ~ '^[a-f0-9]{64}$'),
  age_band text NOT NULL CHECK(age_band IN ('adult','13-17')),
  conversation_epoch integer NOT NULL DEFAULT 0 CHECK(conversation_epoch>=0),
  request_count integer NOT NULL DEFAULT 0 CHECK(request_count>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
  UNIQUE(publisher_id,id), UNIQUE(publisher_id,token_sha256)
);
CREATE INDEX IF NOT EXISTS anonymous_expiry ON ask_bill.anonymous_sessions(publisher_id,expires_at);
CREATE TABLE IF NOT EXISTS ask_bill.anonymous_answers (
  publisher_id uuid NOT NULL,
  session_id uuid NOT NULL,
  answer_id uuid NOT NULL,
  encrypted_answer bytea NOT NULL CHECK(octet_length(encrypted_answer)<=100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(publisher_id,session_id,answer_id),
  FOREIGN KEY(publisher_id,session_id) REFERENCES ask_bill.anonymous_sessions(publisher_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ask_bill.anonymous_usage_daily (
  publisher_id uuid NOT NULL REFERENCES ask_bill.publishers(id),
  usage_day date NOT NULL,
  request_count integer NOT NULL CHECK(request_count>=0),
  PRIMARY KEY(publisher_id,usage_day)
);
DO $policy$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['anonymous_sessions','anonymous_answers','anonymous_usage_daily'] LOOP
    EXECUTE format('ALTER TABLE ask_bill.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('ALTER TABLE ask_bill.%I FORCE ROW LEVEL SECURITY',tbl);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename=tbl AND policyname='publisher_scope') THEN
      EXECUTE format('CREATE POLICY publisher_scope ON ask_bill.%I USING(publisher_id=ask_bill.current_publisher_id()) WITH CHECK(publisher_id=ask_bill.current_publisher_id())',tbl);
    END IF;
  END LOOP;
END $policy$;
COMMIT;
