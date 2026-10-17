-- Defense in depth: enforce the same user on an enrolled identity and its sessions.
-- Existing application reads already join all three columns and fail closed.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='publisher_identity_user_binding' AND conrelid='ask_bill.publisher_auth_identities'::regclass) THEN
  ALTER TABLE ask_bill.publisher_auth_identities ADD CONSTRAINT publisher_identity_user_binding
   UNIQUE(publisher_id,identity_sha256,user_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='publisher_session_identity_user_binding' AND conrelid='ask_bill.publisher_auth_sessions'::regclass) THEN
  ALTER TABLE ask_bill.publisher_auth_sessions ADD CONSTRAINT publisher_session_identity_user_binding
   FOREIGN KEY(publisher_id,identity_sha256,user_id)
   REFERENCES ask_bill.publisher_auth_identities(publisher_id,identity_sha256,user_id) ON DELETE CASCADE;
 END IF;
END $$;
COMMIT;
