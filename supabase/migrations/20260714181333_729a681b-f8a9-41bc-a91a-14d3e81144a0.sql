
-- Receipt-required guard (platform-wide)
CREATE OR REPLACE FUNCTION public.enforce_receipt_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_status text;
  old_status text;
  receipt text;
  method text;
  exempt_methods text[] := ARRAY['wallet','overpayment_wallet','registration_credit','internal_credit','internal','credit','adjustment'];
BEGIN
  -- Extract status (column name differs across tables)
  BEGIN
    new_status := lower(coalesce((to_jsonb(NEW) ->> 'payment_status'), (to_jsonb(NEW) ->> 'status')));
  EXCEPTION WHEN OTHERS THEN new_status := NULL; END;

  IF new_status IS DISTINCT FROM 'completed' AND new_status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;

  receipt := NULLIF(btrim(coalesce((to_jsonb(NEW) ->> 'mpesa_receipt_number'), '')), '');
  method  := lower(coalesce((to_jsonb(NEW) ->> 'payment_method'), ''));

  -- Exempt internal, non-deposit ledger moves
  IF method = ANY(exempt_methods) THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only enforce when transitioning INTO completed/confirmed
  IF TG_OP = 'UPDATE' THEN
    BEGIN
      old_status := lower(coalesce((to_jsonb(OLD) ->> 'payment_status'), (to_jsonb(OLD) ->> 'status')));
    EXCEPTION WHEN OTHERS THEN old_status := NULL; END;
    IF old_status IN ('completed','confirmed') THEN
      RETURN NEW; -- already-confirmed rows can update other fields
    END IF;
  END IF;

  IF receipt IS NULL THEN
    RAISE EXCEPTION 'Payment cannot be marked as % without an M-Pesa receipt number (table=%, ref=%)',
      new_status, TG_TABLE_NAME, coalesce((to_jsonb(NEW) ->> 'payment_reference'),'?')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach to each payment-bearing table
DROP TRIGGER IF EXISTS enforce_receipt_contributions ON public.contributions;
CREATE TRIGGER enforce_receipt_contributions
  BEFORE INSERT OR UPDATE ON public.contributions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_receipt_on_completion();

DROP TRIGGER IF EXISTS enforce_receipt_transactions ON public.transactions;
CREATE TRIGGER enforce_receipt_transactions
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_receipt_on_completion();

DROP TRIGGER IF EXISTS enforce_receipt_welfare_contributions ON public.welfare_contributions;
CREATE TRIGGER enforce_receipt_welfare_contributions
  BEFORE INSERT OR UPDATE ON public.welfare_contributions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_receipt_on_completion();

DROP TRIGGER IF EXISTS enforce_receipt_mchango_donations ON public.mchango_donations;
CREATE TRIGGER enforce_receipt_mchango_donations
  BEFORE INSERT OR UPDATE ON public.mchango_donations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_receipt_on_completion();

DROP TRIGGER IF EXISTS enforce_receipt_organization_donations ON public.organization_donations;
CREATE TRIGGER enforce_receipt_organization_donations
  BEFORE INSERT OR UPDATE ON public.organization_donations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_receipt_on_completion();

COMMENT ON FUNCTION public.enforce_receipt_on_completion() IS
  'Platform-wide guard: rejects insert/update that marks a payment completed/confirmed without an M-Pesa receipt. Exempts internal wallet/credit transfers. Grandfathers already-completed rows.';
