CREATE OR REPLACE FUNCTION public.sync_welfare_member_total_contributed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      ), 0)
      WHERE wm.id = OLD.member_id;
    END IF;
  END IF;

  IF affected_member IS NOT NULL THEN
    UPDATE public.welfare_members wm
    SET total_contributed = COALESCE((
      SELECT SUM(gross_amount) FROM public.welfare_contributions
      WHERE member_id = affected_member AND payment_status = 'completed'
    ), 0)
    WHERE wm.id = affected_member;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_welfare_member_total_contributed ON public.welfare_contributions;
CREATE TRIGGER trg_sync_welfare_member_total_contributed
AFTER INSERT OR UPDATE OR DELETE ON public.welfare_contributions
FOR EACH ROW EXECUTE FUNCTION public.sync_welfare_member_total_contributed();