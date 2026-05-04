-- Backfill the historical chama ledger row that recorded a fractional gross.
-- The actual M-Pesa payment (receipt UD67RBWEG4) was KES 106.00.
-- Old: gross=100.30, net=95.00 (carry-forward 5.70 was wrongly subtracted from gross)
-- New: gross=106.00, net=100.70  (commission 5.30 unchanged; gross now matches reality)
UPDATE public.financial_ledger
SET gross_amount = 106.00,
    net_amount   = 100.70,
    description  = COALESCE(description, '') || ' [backfilled: gross corrected to real payment KES 106.00]'
WHERE id = 'abb80138-d524-499e-bb00-5c3aad0ccbcd'
  AND gross_amount = 100.30
  AND commission_amount = 5.30;

-- Validation trigger: prevent future drift between gross / commission / net
-- on inflow rows. For payouts and other non-revenue rows we don't enforce.
CREATE OR REPLACE FUNCTION public.validate_financial_ledger_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only enforce on inflow / commission rows. Payouts, refunds, transfers exempt.
  IF lower(coalesce(NEW.transaction_type, '')) IN ('contribution', 'donation', 'commission') THEN
    IF NEW.gross_amount IS NULL OR NEW.commission_amount IS NULL OR NEW.net_amount IS NULL THEN
      RAISE EXCEPTION 'financial_ledger inflow rows require gross_amount, commission_amount, net_amount';
    END IF;
    IF abs(NEW.gross_amount - NEW.commission_amount - NEW.net_amount) > 0.01 THEN
      RAISE EXCEPTION 'financial_ledger integrity violation: gross (%) != commission (%) + net (%) for transaction_type=%',
        NEW.gross_amount, NEW.commission_amount, NEW.net_amount, NEW.transaction_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_financial_ledger_integrity ON public.financial_ledger;
CREATE TRIGGER trg_validate_financial_ledger_integrity
  BEFORE INSERT OR UPDATE ON public.financial_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_financial_ledger_integrity();