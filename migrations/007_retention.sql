-- AB-095: tenant-local expired session cleanup; never deletes active sessions.
BEGIN;
CREATE OR REPLACE FUNCTION ask_bill.expire_session_data(
  p_publisher uuid, p_cutoff timestamptz, p_limit integer
) RETURNS TABLE(reservations_removed integer,sessions_removed integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,ask_bill AS $retention$
DECLARE victim_ids uuid[];
BEGIN
  IF p_publisher IS NULL OR p_publisher IS DISTINCT FROM ask_bill.current_publisher_id() THEN
    RAISE EXCEPTION 'PUBLISHER_SCOPE_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_cutoff IS NULL OR p_cutoff > clock_timestamp() OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'INVALID_RETENTION_REQUEST' USING ERRCODE='22023';
  END IF;
  -- Bounded rows are locked to stop racing cleaners from deleting the same record.
  SELECT array_agg(id) INTO victim_ids FROM (
    SELECT id FROM ask_bill.sessions
    WHERE publisher_id=p_publisher AND expires_at <= p_cutoff
    ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) candidate;
  reservations_removed:=0;
  sessions_removed:=0;
  IF COALESCE(array_length(victim_ids,1),0)>0 THEN
    -- Child rows are always deleted before their parent session, in one transaction.
    DELETE FROM ask_bill.usage_reservations
    WHERE publisher_id=p_publisher AND session_id=ANY(victim_ids);
    GET DIAGNOSTICS reservations_removed=ROW_COUNT;
    DELETE FROM ask_bill.sessions
    WHERE publisher_id=p_publisher AND id=ANY(victim_ids) AND expires_at <= p_cutoff;
    GET DIAGNOSTICS sessions_removed=ROW_COUNT;
  END IF;
  RETURN NEXT;
END;
$retention$;
-- A new executable function must not be callable by unauthenticated PUBLIC.
REVOKE ALL ON FUNCTION ask_bill.expire_session_data(uuid,timestamptz,integer) FROM PUBLIC;
COMMIT;
