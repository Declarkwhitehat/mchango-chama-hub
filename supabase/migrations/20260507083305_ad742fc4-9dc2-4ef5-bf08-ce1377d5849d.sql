
-- Phase 1: 4 RPCs

CREATE OR REPLACE FUNCTION public.get_member_dashboard(p_chama_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member record;
  v_chama record;
  v_member_count int;
  v_current_cycle record;
  v_current_payment record;
  v_payout record;
  v_contributions jsonb;
  v_missed jsonb;
  v_total_outstanding numeric := 0;
  v_removal record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error','Unauthorized');
  END IF;

  SELECT cm.*, p.full_name, p.email, p.phone
    INTO v_member
    FROM chama_members cm
    LEFT JOIN profiles p ON p.id = cm.user_id
   WHERE cm.chama_id = p_chama_id AND cm.user_id = v_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Not a member','details','You are not a member of this chama');
  END IF;

  IF v_member.approval_status <> 'approved' THEN
    RETURN jsonb_build_object('error','Pending approval',
      'details','Your membership request is still pending approval',
      'approval_status', v_member.approval_status);
  END IF;

  IF v_member.status = 'removed' THEN
    SELECT * INTO v_removal
      FROM chama_member_removals
     WHERE member_id = v_member.id
     ORDER BY removed_at DESC
     LIMIT 1;
    SELECT * INTO v_chama FROM chama WHERE id = p_chama_id;
    RETURN jsonb_build_object(
      'success', true,
      'data', jsonb_build_object(
        'is_removed', true,
        'member', jsonb_build_object(
          'id', v_member.id,
          'full_name', v_member.full_name,
          'member_code', v_member.member_code,
          'removal_reason', COALESCE(v_member.removal_reason, v_removal.removal_reason, 'Removed due to consecutive missed payments'),
          'removed_at', COALESCE(v_member.removed_at, v_removal.removed_at)
        ),
        'chama', jsonb_build_object('name', COALESCE(v_chama.name, 'Unknown'))
      )
    );
  END IF;

  SELECT * INTO v_chama FROM chama WHERE id = p_chama_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Chama not found');
  END IF;

  SELECT COUNT(*) INTO v_member_count
    FROM chama_members
   WHERE chama_id = p_chama_id AND approval_status = 'approved';

  SELECT * INTO v_current_cycle
    FROM contribution_cycles
   WHERE chama_id = p_chama_id
     AND start_date <= now() AND end_date >= now()
   LIMIT 1;

  IF v_current_cycle.id IS NOT NULL THEN
    SELECT * INTO v_current_payment
      FROM member_cycle_payments
     WHERE member_id = v_member.id AND cycle_id = v_current_cycle.id
     LIMIT 1;
  END IF;

  SELECT * INTO v_payout
    FROM get_member_payout_position(v_member.id);

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.contribution_date DESC), '[]'::jsonb)
    INTO v_contributions
    FROM contributions c
   WHERE c.chama_id = p_chama_id AND c.member_id = v_member.id;

  WITH mp AS (
    SELECT mcp.*, cc.cycle_number, cc.start_date AS c_start, cc.end_date AS c_end, cc.due_amount AS c_due
      FROM member_cycle_payments mcp
      JOIN contribution_cycles cc ON cc.id = mcp.cycle_id
     WHERE mcp.member_id = v_member.id AND mcp.is_paid = false
     ORDER BY mcp.created_at ASC
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'cycle_number', cycle_number,
      'start_date',   c_start,
      'end_date',     c_end,
      'amount_due',   amount_due,
      'amount_paid',  COALESCE(amount_paid,0),
      'amount_remaining', COALESCE(amount_due,0) - COALESCE(amount_paid,0)
    )), '[]'::jsonb),
    COALESCE(SUM(COALESCE(amount_due,0) - COALESCE(amount_paid,0)), 0)
  INTO v_missed, v_total_outstanding
  FROM mp;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'member', jsonb_build_object(
        'id', v_member.id,
        'full_name', v_member.full_name,
        'email', v_member.email,
        'phone', v_member.phone,
        'member_code', v_member.member_code,
        'joined_at', v_member.joined_at,
        'order_index', v_member.order_index,
        'balance_credit', COALESCE(v_member.balance_credit,0),
        'balance_deficit', COALESCE(v_member.balance_deficit,0),
        'missed_payments_count', COALESCE(v_member.missed_payments_count,0),
        'total_outstanding', v_total_outstanding,
        'last_payment_date', v_member.last_payment_date,
        'next_due_date', v_member.next_due_date
      ),
      'missed_payments', v_missed,
      'chama', jsonb_build_object(
        'name', v_chama.name,
        'contribution_amount', v_chama.contribution_amount,
        'contribution_frequency', v_chama.contribution_frequency,
        'commission_rate', COALESCE(v_chama.commission_rate, 0.05),
        'member_count', v_member_count,
        'status', v_chama.status
      ),
      'current_cycle', CASE WHEN v_current_payment.id IS NOT NULL THEN
        jsonb_build_object(
          'is_paid', v_current_payment.is_paid,
          'amount_paid', v_current_payment.amount_paid,
          'amount_due', v_current_payment.amount_due,
          'paid_at', v_current_payment.paid_at
        ) ELSE NULL END,
      'payment_history', v_contributions,
      'payout_schedule', CASE WHEN v_payout.position_in_queue IS NOT NULL THEN
        jsonb_build_object(
          'position_in_queue', v_payout.position_in_queue,
          'estimated_payout_date', v_payout.estimated_payout_date,
          'estimated_amount', v_payout.estimated_amount
        ) ELSE NULL END
    )
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_search(p_query text, p_type text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q text := substring(trim(coalesce(p_query,'')) for 100);
  v_pat text;
  v_users jsonb := '[]'::jsonb;
  v_members jsonb := '[]'::jsonb;
  v_mchangos jsonb := '[]'::jsonb;
  v_chamas jsonb := '[]'::jsonb;
  v_orgs jsonb := '[]'::jsonb;
  v_txs jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object('error','Forbidden - Admin only');
  END IF;
  IF v_q = '' THEN
    RETURN jsonb_build_object('error','Search query required');
  END IF;
  v_pat := '%' || v_q || '%';

  IF p_type IN ('all','user','email','phone','id_number') THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      INTO v_users
      FROM (
        SELECT * FROM profiles
         WHERE CASE p_type
           WHEN 'email'     THEN email     ILIKE v_pat
           WHEN 'phone'     THEN phone     ILIKE v_pat
           WHEN 'id_number' THEN id_number ILIKE v_pat
           WHEN 'user'      THEN full_name ILIKE v_pat
           ELSE (full_name ILIKE v_pat OR email ILIKE v_pat OR phone ILIKE v_pat OR id_number ILIKE v_pat)
         END
         LIMIT 50
      ) t;
  END IF;

  IF p_type IN ('all','member_code') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      INTO v_members
      FROM (
        (SELECT cm.*,
               jsonb_build_object(
                 'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
                 'id_number', p.id_number, 'kyc_status', p.kyc_status,
                 'payment_details_completed', p.payment_details_completed
               ) AS profiles,
               jsonb_build_object(
                 'name', c.name, 'slug', c.slug, 'group_code', c.group_code,
                 'contribution_amount', c.contribution_amount,
                 'contribution_frequency', c.contribution_frequency,
                 'status', c.status, 'max_members', c.max_members
               ) AS chama,
               'chama'::text AS source_type
          FROM chama_members cm
          LEFT JOIN profiles p ON p.id = cm.user_id
          LEFT JOIN chama c    ON c.id = cm.chama_id
         WHERE cm.member_code ILIKE v_pat
         LIMIT 50)
        UNION ALL
        (SELECT wm.*,
               jsonb_build_object(
                 'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
                 'id_number', p.id_number, 'kyc_status', p.kyc_status,
                 'payment_details_completed', p.payment_details_completed
               ) AS profiles,
               jsonb_build_object('name', w.name, 'slug', w.slug, 'status', w.status) AS welfares,
               'welfare'::text AS source_type
          FROM welfare_members wm
          LEFT JOIN profiles p ON p.id = wm.user_id
          LEFT JOIN welfares w ON w.id = wm.welfare_id
         WHERE wm.member_code ILIKE v_pat
         LIMIT 50)
      ) t;
  END IF;

  IF p_type IN ('all','mchango_slug') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      INTO v_mchangos
      FROM (
        SELECT m.*, jsonb_build_object('full_name', p.full_name, 'email', p.email) AS profiles
          FROM mchango m
          LEFT JOIN profiles p ON p.id = m.created_by
         WHERE m.slug ILIKE v_pat OR m.title ILIKE v_pat
         LIMIT 50
      ) t;
  END IF;

  IF p_type IN ('all','chama') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      INTO v_chamas
      FROM (
        SELECT c.*, jsonb_build_object('full_name', p.full_name, 'email', p.email) AS profiles
          FROM chama c
          LEFT JOIN profiles p ON p.id = c.created_by
         WHERE c.slug ILIKE v_pat OR c.name ILIKE v_pat
         LIMIT 50
      ) t;
  END IF;

  IF p_type IN ('all','organization') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      INTO v_orgs
      FROM (
        SELECT o.*, jsonb_build_object('full_name', p.full_name, 'email', p.email) AS profiles
          FROM organizations o
          LEFT JOIN profiles p ON p.id = o.created_by
         WHERE o.slug ILIKE v_pat OR o.name ILIKE v_pat OR o.category ILIKE v_pat
         LIMIT 50
      ) t;
  END IF;

  IF p_type IN ('all','transaction_id') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
      INTO v_txs
      FROM (
        SELECT tr.*, jsonb_build_object('full_name', p.full_name, 'email', p.email) AS profiles
          FROM transactions tr
          LEFT JOIN profiles p ON p.id = tr.user_id
         WHERE (CASE WHEN v_q ~ '^[0-9a-fA-F-]{36}$' THEN tr.id::text = v_q ELSE false END)
            OR tr.payment_reference ILIKE v_pat
         LIMIT 50
      ) t;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'users', v_users, 'members', v_members, 'mchangos', v_mchangos,
      'chamas', v_chamas, 'organizations', v_orgs, 'transactions', v_txs
    )
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_admin_member_activity(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF v_uid IS NULL OR NOT has_role(v_uid, 'admin'::app_role) THEN
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
  FROM (SELECT * FROM unified ORDER BY created_at DESC LIMIT 50) sub;

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'profile', v_profile,
      'chama_memberships', v_chama_m,
      'welfare_memberships', v_welfare_m,
      'payment_methods', v_pmethods,
      'withdrawals', v_withdrawals,
      'audit_logs', v_audit,
      'payments', v_payments
    )
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.get_admin_transactions(p_search text DEFAULT '', p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_search text := lower(coalesce(p_search,''));
  v_lim int := COALESCE(p_limit, 100);
  v_pat text;
  v_txs jsonb;
  v_total int;
BEGIN
  IF v_uid IS NULL OR NOT has_role(v_uid, 'admin'::app_role) THEN
    RETURN jsonb_build_object('error','Unauthorized');
  END IF;
  v_pat := '%' || v_search || '%';

  WITH unified AS (
    SELECT d.id, 'Organization'::text AS source, COALESCE(o.name,'Unknown') AS source_name,
           'donation'::text AS transaction_type,
           COALESCE(d.gross_amount, d.amount) AS amount,
           COALESCE(d.commission_amount,0) AS commission,
           COALESCE(d.net_amount, d.amount) AS net_amount,
           d.payment_status AS status, d.payment_reference, d.mpesa_receipt_number AS mpesa_receipt,
           d.payment_method, d.created_at, d.completed_at,
           COALESCE(d.display_name,'Anonymous') AS user_name,
           d.phone AS user_phone, d.email AS user_email,
           d.organization_id AS entity_id, NULL::uuid AS user_id
      FROM organization_donations d LEFT JOIN organizations o ON o.id = d.organization_id
    UNION ALL
    SELECT d.id, 'Mchango', COALESCE(m.title,'Unknown'), 'donation',
           COALESCE(d.gross_amount, d.amount), COALESCE(d.commission_amount,0),
           COALESCE(d.net_amount, d.amount),
           d.payment_status, d.payment_reference, d.mpesa_receipt_number,
           d.payment_method, d.created_at, d.completed_at,
           COALESCE(d.display_name,'Anonymous'), d.phone, d.email,
           d.mchango_id, NULL::uuid
      FROM mchango_donations d LEFT JOIN mchango m ON m.id = d.mchango_id
    UNION ALL
    SELECT w.id, 'Welfare', COALESCE(wf.name,'Unknown'), 'contribution',
           w.gross_amount, COALESCE(w.commission_amount,0), w.net_amount,
           w.payment_status, w.payment_reference, w.mpesa_receipt_number,
           w.payment_method, w.created_at, w.completed_at,
           COALESCE(p.full_name,'Unknown'), p.phone, p.email,
           w.welfare_id, w.user_id
      FROM welfare_contributions w
      LEFT JOIN welfares wf ON wf.id = w.welfare_id
      LEFT JOIN profiles p  ON p.id = w.user_id
    UNION ALL
    SELECT c.id, 'Chama', COALESCE(ch.name,'Unknown'), 'contribution',
           c.amount, 0::numeric, c.amount,
           c.status, c.payment_reference, c.mpesa_receipt_number,
           NULL::text, c.created_at, NULL::timestamptz,
           COALESCE(p.full_name,'Unknown'), p.phone, p.email,
           c.chama_id, cm.user_id
      FROM contributions c
      LEFT JOIN chama ch ON ch.id = c.chama_id
      LEFT JOIN chama_members cm ON cm.id = c.member_id
      LEFT JOIN profiles p ON p.id = cm.user_id
  ),
  filtered AS (
    SELECT * FROM unified
    WHERE v_search = '' OR (
      lower(coalesce(user_name,''))         LIKE v_pat OR
      lower(coalesce(user_email,''))        LIKE v_pat OR
      coalesce(user_phone,'')               LIKE v_pat OR
      ('+' || coalesce(user_phone,''))      LIKE v_pat OR
      lower(coalesce(payment_reference,'')) LIKE v_pat OR
      lower(coalesce(mpesa_receipt,''))     LIKE v_pat OR
      lower(source)                         LIKE v_pat OR
      lower(coalesce(source_name,''))       LIKE v_pat OR
      lower(transaction_type)               LIKE v_pat
    )
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC), '[]'::jsonb),
    (SELECT count(*)::int FROM filtered)
  INTO v_txs, v_total
  FROM (SELECT * FROM filtered ORDER BY created_at DESC LIMIT v_lim) l;

  RETURN jsonb_build_object('transactions', COALESCE(v_txs,'[]'::jsonb), 'total', COALESCE(v_total,0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_dashboard(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search(text, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_member_activity(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_transactions(text, int)  TO authenticated;
