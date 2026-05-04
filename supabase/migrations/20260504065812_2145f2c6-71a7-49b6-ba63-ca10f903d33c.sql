-- Withdrawals: only one COMPLETED withdrawal can hold a given payment_reference (M-Pesa receipt)
CREATE UNIQUE INDEX IF NOT EXISTS unique_withdrawals_completed_payment_ref
  ON public.withdrawals (payment_reference)
  WHERE status = 'completed' AND payment_reference IS NOT NULL;

-- Welfare contributions
CREATE UNIQUE INDEX IF NOT EXISTS unique_welfare_contributions_mpesa_receipt
  ON public.welfare_contributions (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL;

-- Mchango donations
CREATE UNIQUE INDEX IF NOT EXISTS unique_mchango_donations_mpesa_receipt
  ON public.mchango_donations (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL;

-- Organization donations
CREATE UNIQUE INDEX IF NOT EXISTS unique_org_donations_mpesa_receipt
  ON public.organization_donations (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL;