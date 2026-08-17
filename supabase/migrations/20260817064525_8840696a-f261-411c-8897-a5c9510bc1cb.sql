CREATE OR REPLACE FUNCTION public.sync_welfare_member_total_contributed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_member UUID;
  cutoff CONSTANT timestamptz := '2026-08-17 06:45:00+00';
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_member := OLD.member_id;
  ELSE
    affected_member := NEW.member_id;
    IF TG_OP = 'UPDATE' AND OLD.member_id IS DISTINCT FROM NEW.member_id AND OLD.member_id IS NOT NULL THEN
      UPDATE public.welfare_members wm
      SET total_contributed = COALESCE((
        SELECT SUM(CASE WHEN created_at >= cutoff THEN COALESCE(net_amount, gross_amount) ELSE gross_amount END)
        FROM public.welfare_contributions
        WHERE member_id = OLD.member_id AND payment_status = 'completed'
          AND COALESCE(category, 'contribution') <> 'registration_fee'
      ), 0)
      WHERE wm.id = OLD.member_id;
    END IF;
  END IF;

  IF affected_member IS NOT NULL THEN
    UPDATE public.welfare_members wm
    SET total_contributed = COALESCE((
      SELECT SUM(CASE WHEN created_at >= cutoff THEN COALESCE(net_amount, gross_amount) ELSE gross_amount END)
      FROM public.welfare_contributions
      WHERE member_id = affected_member AND payment_status = 'completed'
        AND COALESCE(category, 'contribution') <> 'registration_fee'
    ), 0)
    WHERE wm.id = affected_member;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;