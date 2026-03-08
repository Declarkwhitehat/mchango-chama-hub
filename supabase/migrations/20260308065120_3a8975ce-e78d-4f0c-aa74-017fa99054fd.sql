
-- Fix 1: Remove duplicate C2B contribution records (same mpesa receipt as existing STK records)
-- UC77R8RQSH: Keep STK (0cafe1e9), remove C2B duplicate (9c568bef)
DELETE FROM contributions WHERE id = '9c568bef-2dcd-4a7a-97aa-1d63a726a0ec';
-- UC7IT8KWLP: Keep STK (aedabaad), remove C2B duplicate (33ecf156)
DELETE FROM contributions WHERE id = '33ecf156-9a1c-4443-aa5e-919e9fdbef99';

-- Fix 2: Add payment_notes to STK contributions that are missing them
UPDATE contributions SET payment_notes = 'Online STK Push payment. Receipt: UC77R8RQSH'
WHERE id = '0cafe1e9-a044-49c4-8c93-d5a603ef54f6' AND payment_notes IS NULL;

UPDATE contributions SET payment_notes = 'Online STK Push payment. Receipt: UC7IT8KWLP'
WHERE id = 'aedabaad-9502-43b1-a36f-c19ff7be765c' AND payment_notes IS NULL;

-- Fix 3: Recalculate chama financials from actual unique completed contributions
-- Real total: 3 contributions × KES 100 = KES 300 gross
-- Commission at 5%: KES 15
-- Available: KES 285
UPDATE chama SET
  total_gross_collected = 300,
  total_commission_paid = 15,
  available_balance = 285,
  total_withdrawn = 0
WHERE id = '91313790-2654-47a1-8184-d4594e1b2955';

-- Fix 4: Update member_cycle_payments for members who actually paid
-- d0e85768 paid KES 200 (2 completed contributions), cycle needs KES 100 => fully paid
UPDATE member_cycle_payments SET
  amount_paid = 100,
  amount_remaining = 0,
  fully_paid = true,
  is_paid = true,
  paid_at = '2026-03-07T18:20:07Z',
  payment_allocations = '[{"amount":100,"source":"contribution","timestamp":"2026-03-07T18:20:07Z"}]'::jsonb
WHERE id = 'abd92046-e1ce-4ded-9373-0dccde473d7a';

-- c59ef836 paid KES 100 (1 completed contribution), cycle needs KES 100 => fully paid
UPDATE member_cycle_payments SET
  amount_paid = 100,
  amount_remaining = 0,
  fully_paid = true,
  is_paid = true,
  paid_at = '2026-03-07T18:33:57Z',
  payment_allocations = '[{"amount":100,"source":"contribution","timestamp":"2026-03-07T18:33:57Z"}]'::jsonb
WHERE id = '399f8449-354e-456c-8369-851cee04d422';

-- Fix 5: Clean up duplicate financial_ledger and company_earnings entries
-- Remove ledger entries that reference deleted contributions
DELETE FROM financial_ledger WHERE reference_id IN ('9c568bef-2dcd-4a7a-97aa-1d63a726a0ec', '33ecf156-9a1c-4443-aa5e-919e9fdbef99');
DELETE FROM company_earnings WHERE reference_id IN ('9c568bef-2dcd-4a7a-97aa-1d63a726a0ec', '33ecf156-9a1c-4443-aa5e-919e9fdbef99');
