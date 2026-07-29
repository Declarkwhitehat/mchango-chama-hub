CREATE OR REPLACE FUNCTION public.admin_search(p_query text, p_type text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_q text := substring(trim(coalesce(p_query,'')) for 100);
  v_pat text;
  v_digits text;
  v_phone_pat text;
  v_users jsonb := '[]'::jsonb;
  v_members jsonb := '[]'::jsonb;
  v_mchangos jsonb := '[]'::jsonb;
  v_chamas jsonb := '[]'::jsonb;
  v_orgs jsonb := '[]'::jsonb;
  v_txs jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (has_role(v_uid, 'admin'::app_role) OR has_role(v_uid, 'super_admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Forbidden - Admin only');
  END IF;
  IF v_q = '' THEN
    RETURN jsonb_build_object('error','Search query required');
  END IF;
  v_pat := '%' || v_q || '%';

  -- Normalise phone-like queries: match on the last 9 significant digits
  v_digits := regexp_replace(v_q, '\D', '', 'g');
  IF length(v_digits) >= 9 THEN
    v_phone_pat := '%' || right(v_digits, 9) || '%';
  ELSE
    v_phone_pat := NULL;
  END IF;

  IF p_type IN ('all','user','email','phone','id_number') THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      INTO v_users
      FROM (
        SELECT * FROM profiles
         WHERE CASE p_type
           WHEN 'email'     THEN email     ILIKE v_pat
           WHEN 'phone'     THEN (phone ILIKE v_pat OR (v_phone_pat IS NOT NULL AND regexp_replace(coalesce(phone,''), '\D', '', 'g') ILIKE v_phone_pat))
           WHEN 'id_number' THEN id_number ILIKE v_pat
           WHEN 'user'      THEN full_name ILIKE v_pat
           ELSE (full_name ILIKE v_pat OR email ILIKE v_pat OR phone ILIKE v_pat OR id_number ILIKE v_pat
                 OR (v_phone_pat IS NOT NULL AND regexp_replace(coalesce(phone,''), '\D', '', 'g') ILIKE v_phone_pat))
         END
         LIMIT 50
      ) t;
  END IF;

  IF p_type IN ('all','member_code') THEN
    SELECT COALESCE(jsonb_agg(obj), '[]'::jsonb)
      INTO v_members
      FROM (
        (SELECT to_jsonb(cm) ||
               jsonb_build_object(
                 'profiles', jsonb_build_object(
                   'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
                   'id_number', p.id_number, 'kyc_status', p.kyc_status,
                   'payment_details_completed', p.payment_details_completed
                 ),
                 'chama', jsonb_build_object(
                   'name', c.name, 'slug', c.slug, 'group_code', c.group_code,
                   'contribution_amount', c.contribution_amount,
                   'contribution_frequency', c.contribution_frequency,
                   'status', c.status, 'max_members', c.max_members
                 ),
                 'source_type', 'chama'
               ) AS obj
          FROM chama_members cm
          LEFT JOIN profiles p ON p.id = cm.user_id
          LEFT JOIN chama c    ON c.id = cm.chama_id
         WHERE cm.member_code ILIKE v_pat
         LIMIT 50)
        UNION ALL
        (SELECT to_jsonb(wm) ||
               jsonb_build_object(
                 'profiles', jsonb_build_object(
                   'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
                   'id_number', p.id_number, 'kyc_status', p.kyc_status,
                   'payment_details_completed', p.payment_details_completed
                 ),
                 'welfares', jsonb_build_object('name', w.name, 'slug', w.slug, 'status', w.status),
                 'source_type', 'welfare'
               ) AS obj
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
$function$;