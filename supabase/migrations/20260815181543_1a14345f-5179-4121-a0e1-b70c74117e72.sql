CREATE OR REPLACE FUNCTION public.notify_payout_receipt_sms()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/payout-receipt-sms';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoaGNid2J2dWVpbWV6bXRmdHRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMzE5NzAsImV4cCI6MjA3NDkwNzk3MH0.uu8ltcznYrIzyxHCfDM40aLJBQE2dsY0OBTBv1n2rXE';
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed')
     AND COALESCE(NEW.metadata->>'payout_sms_sent_at','') = ''
     AND COALESCE(NEW.metadata->>'debt_sms_sent_at','') = '' THEN
    BEGIN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || v_anon,
          'apikey', v_anon
        ),
        body := jsonb_build_object('withdrawal_id', NEW.id::text)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payout_receipt_sms ON public.withdrawals;
CREATE TRIGGER trg_notify_payout_receipt_sms
AFTER UPDATE OF status ON public.withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.notify_payout_receipt_sms();