CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cut timestamptz := now() - interval '90 days';
  v_audit int := 0; v_admin int := 0; v_recon int := 0; v_fraud int := 0;
BEGIN
  DELETE FROM audit_logs WHERE created_at < v_cut;
  GET DIAGNOSTICS v_audit = ROW_COUNT;
  DELETE FROM admin_action_log WHERE created_at < v_cut;
  GET DIAGNOSTICS v_admin = ROW_COUNT;
  DELETE FROM reconciliation_logs WHERE created_at < v_cut;
  GET DIAGNOSTICS v_recon = ROW_COUNT;
  DELETE FROM fraud_events WHERE created_at < v_cut AND COALESCE(resolved, true);
  GET DIAGNOSTICS v_fraud = ROW_COUNT;
  RETURN jsonb_build_object('audit_logs', v_audit, 'admin_action_log', v_admin,
                            'reconciliation_logs', v_recon, 'fraud_events', v_fraud);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_old_logs() FROM anon, authenticated;