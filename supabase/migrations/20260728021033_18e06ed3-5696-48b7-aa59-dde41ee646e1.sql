CREATE OR REPLACE FUNCTION public.sync_welfare_member_total_contributed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected_member UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_member := OLD.member_id;
  ELSE
    affected_member := NEW.member_id;
    IF TG_OP = 'UPDATE' AND OLD.member_id IS DISTINCT FROM NEW.member_id AND OLD.member_id IS NOT NULL THEN
      UPDATE public.welfare_members wm
      SET total_contributed = COALESCE((
        SELECT SUM(gross_amount) FROM public.welfare_contributions
        WHERE member_id = OLD.member_id AND payment_status = 'completed'
          AND COALESCE(category, 'contribution') <> 'registration_fee'
      ), 0)
      WHERE wm.id = OLD.member_id;
    END IF;
  END IF;

  IF affected_member IS NOT NULL THEN
    UPDATE public.welfare_members wm
    SET total_contributed = COALESCE((
      SELECT SUM(gross_amount) FROM public.welfare_contributions
      WHERE member_id = affected_member AND payment_status = 'completed'
        AND COALESCE(category, 'contribution') <> 'registration_fee'
    ), 0)
    WHERE wm.id = affected_member;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

UPDATE public.welfare_members wm
SET total_contributed = COALESCE((
  SELECT SUM(gross_amount) FROM public.welfare_contributions wc
  WHERE wc.member_id = wm.id AND wc.payment_status = 'completed'
    AND COALESCE(wc.category, 'contribution') <> 'registration_fee'
), 0);