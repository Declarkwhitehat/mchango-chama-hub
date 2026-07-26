CREATE OR REPLACE FUNCTION public.get_admin_member_activity(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_chama_m jsonb;
  v_welfare_m jsonb;
  v_pmethods jsonb;
  v_withdrawals jsonb;
  v_audit jsonb;
  v_payments jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'super_admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Forbidden');
  END IF;

  SELECT to_jsonb(p) INTO v_profile FROM profiles p WHERE p.id = p_user_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_chama_m
    FROM (
      SELECT cm.*, jsonb_build_object(
        'name', c.name, 'slug', c.slug, 'group_code', c.group_code,
        'contribution_amount', c.contribution_amount,
        'contribution_frequency', c.contribution_frequency, 'status', c.status
      ) AS chama
      FROM chama_members cm
      LEFT JOIN chama c ON c.id = cm.chama_id
      WHERE cm.user_id = p_user_id
      LIMIT 50
    ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_welfare_m
    FROM (
      SELECT wm.*, jsonb_build_object(
        'name', w.name, 'slug', w.slug, 'status', w.status,
        'contribution_amount', w.contribution_amount
      ) AS welfares
      FROM welfare_members wm
      LEFT JOIN welfares w ON w.id = wm.welfare_id
      WHERE wm.user_id = p_user_id
      LIMIT 50
    ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(pm)), '[]'::jsonb) INTO v_pmethods
    FROM payment_methods pm WHERE pm.user_id = p_user_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_withdrawals
    FROM (
      SELECT w.*,
        jsonb_build_object('name', c.name)  AS chama,
        jsonb_build_object('title', m.title) AS mchango,
        jsonb_build_object('name', wf.name) AS welfares,
        jsonb_build_object('name', o.name)  AS organizations
      FROM withdrawals w
      LEFT JOIN chama c ON c.id = w.chama_id
      LEFT JOIN mchango m ON m.id = w.mchango_id
      LEFT JOIN welfares wf ON wf.id = w.welfare_id
      LEFT JOIN organizations o ON o.id = w.organization_id
      WHERE w.requested_by = p_user_id
      ORDER BY w.created_at DESC
      LIMIT 20
    ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb) INTO v_audit
    FROM (SELECT * FROM audit_logs WHERE user_id = p_user_id ORDER BY created_at DESC LIMIT 100) a;

  WITH unified AS (
    SELECT d.id, 'Organization Donation'::text AS type, COALESCE(o.name,'Unknown') AS source_name,
           COALESCE(d.gross_amount, d.amount) AS amount, d.net_amount, d.commission_amount AS commission,
           d.payment_status AS status, d.mpesa_receipt_number AS mpesa_receipt,
           d.payment_reference AS reference, d.created_at, d.completed_at
      FROM organization_donations d LEFT JOIN organizations o ON o.id = d.organization_id
     WHERE d.user_id = p_user_id
    UNION ALL
    SELECT d.id, 'Mchango Donation', COALESCE(m.title,'Unknown'),
           COALESCE(d.gross_amount, d.amount), d.net_amount, d.commission_amount,
           d.payment_status, d.mpesa_receipt_number, d.payment_reference, d.created_at, d.completed_at
      FROM mchango_donations d LEFT JOIN mchango m ON m.id = d.mchango_id
     WHERE d.user_id = p_user_id
    UNION ALL
    SELECT d.id, 'Welfare Contribution', COALESCE(w.name,'Unknown'),
           d.gross_amount, d.net_amount, d.commission_amount,
           d.payment_status, d.mpesa_receipt_number, d.payment_reference, d.created_at, d.completed_at
      FROM welfare_contributions d LEFT JOIN welfares w ON w.id = d.welfare_id
     WHERE d.user_id = p_user_id
    UNION ALL
    SELECT c.id, 'Chama Contribution', COALESCE(ch.name,'Unknown'),
           c.amount, NULL::numeric, NULL::numeric,
           c.status, c.mpesa_receipt_number, c.payment_reference, c.created_at, NULL::timestamptz
      FROM contributions c
      JOIN chama_members cm ON cm.id = c.member_id AND cm.user_id = p_user_id
      LEFT JOIN chama ch ON ch.id = c.chama_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'type', type, 'source_name', source_name,
    'amount', amount, 'net_amount', net_amount, 'commission', commission,
    'status', status, 'mpesa_receipt', mpesa_receipt, 'reference', reference,
    'created_at', created_at, 'completed_at', completed_at
  ) ORDER BY created_at DESC), '[]'::jsonb) INTO v_payments
  FROM unified;

  RETURN jsonb_build_object('data', jsonb_build_object(
    'profile', v_profile,
    'chama_memberships', v_chama_m,
    'welfare_memberships', v_welfare_m,
    'payment_methods', v_pmethods,
    'withdrawals', v_withdrawals,
    'audit_logs', v_audit,
    'payments', v_payments
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_member_activity(uuid) TO authenticated;