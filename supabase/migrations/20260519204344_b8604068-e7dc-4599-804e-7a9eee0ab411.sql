CREATE OR REPLACE FUNCTION public.get_admin_transactions(p_search text DEFAULT ''::text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           d.payment_status::text AS status, d.payment_reference, d.mpesa_receipt_number AS mpesa_receipt,
           d.payment_method, d.created_at, d.completed_at,
           COALESCE(d.display_name,'Anonymous') AS user_name,
           d.phone AS user_phone, d.email AS user_email,
           d.organization_id AS entity_id, NULL::uuid AS user_id
      FROM organization_donations d LEFT JOIN organizations o ON o.id = d.organization_id
    UNION ALL
    SELECT d.id, 'Mchango', COALESCE(m.title,'Unknown'), 'donation',
           COALESCE(d.gross_amount, d.amount), COALESCE(d.commission_amount,0),
           COALESCE(d.net_amount, d.amount),
           d.payment_status::text, d.payment_reference, d.mpesa_receipt_number,
           d.payment_method, d.created_at, d.completed_at,
           COALESCE(d.display_name,'Anonymous'), d.phone, d.email,
           d.mchango_id, NULL::uuid
      FROM mchango_donations d LEFT JOIN mchango m ON m.id = d.mchango_id
    UNION ALL
    SELECT w.id, 'Welfare', COALESCE(wf.name,'Unknown'), 'contribution',
           w.gross_amount, COALESCE(w.commission_amount,0), w.net_amount,
           w.payment_status::text, w.payment_reference, w.mpesa_receipt_number,
           w.payment_method, w.created_at, w.completed_at,
           COALESCE(p.full_name,'Unknown'), p.phone, p.email,
           w.welfare_id, w.user_id
      FROM welfare_contributions w
      LEFT JOIN welfares wf ON wf.id = w.welfare_id
      LEFT JOIN profiles p  ON p.id = w.user_id
    UNION ALL
    SELECT c.id, 'Chama', COALESCE(ch.name,'Unknown'), 'contribution',
           c.amount, 0::numeric, c.amount,
           c.status::text, c.payment_reference, c.mpesa_receipt_number,
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
$function$;