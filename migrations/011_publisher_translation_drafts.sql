-- Private translation drafts retain the source digest used by the translator.
-- A later source correction makes that draft visibly stale; no draft is public.
BEGIN;
CREATE TABLE IF NOT EXISTS ask_bill.publisher_translation_drafts (
  publisher_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  language text NOT NULL CHECK (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$' AND language <> 'en'),
  source_version_id uuid NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  draft_text text NOT NULL CHECK (octet_length(draft_text) BETWEEN 1 AND 100000),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (publisher_id,bill_id,language),
  FOREIGN KEY (publisher_id,bill_id,source_version_id)
    REFERENCES ask_bill.bill_versions(publisher_id,bill_id,id) ON DELETE RESTRICT
);
DO $translation$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='ask_bill' AND tablename='publisher_translation_drafts' AND policyname='publisher_scope') THEN
    CREATE POLICY publisher_scope ON ask_bill.publisher_translation_drafts FOR ALL
      USING (publisher_id=ask_bill.current_publisher_id())
      WITH CHECK (publisher_id=ask_bill.current_publisher_id());
  END IF;
END
$translation$;
ALTER TABLE ask_bill.publisher_translation_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_bill.publisher_translation_drafts FORCE ROW LEVEL SECURITY;
COMMIT;
