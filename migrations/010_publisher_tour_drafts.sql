-- Private, version-pinned source tour curation. Public tours stay on reviewed releases.
BEGIN;
CREATE TABLE IF NOT EXISTS ask_bill.publisher_tour_drafts (
  publisher_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  version_id uuid NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  step_ids jsonb NOT NULL CHECK (jsonb_typeof(step_ids)='array' AND jsonb_array_length(step_ids) BETWEEN 1 AND 12),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (publisher_id,version_id),
  FOREIGN KEY (publisher_id,bill_id,version_id)
    REFERENCES ask_bill.bill_versions(publisher_id,bill_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS publisher_tour_drafts_by_bill
  ON ask_bill.publisher_tour_drafts(publisher_id,bill_id,updated_at DESC);
DO $tour$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='publisher_tour_drafts' AND policyname='publisher_scope') THEN
    CREATE POLICY publisher_scope ON ask_bill.publisher_tour_drafts FOR ALL
      USING (publisher_id=ask_bill.current_publisher_id())
      WITH CHECK (publisher_id=ask_bill.current_publisher_id());
  END IF;
END
$tour$;
ALTER TABLE ask_bill.publisher_tour_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.publisher_tour_drafts FORCE ROW LEVEL SECURITY;
COMMIT;
