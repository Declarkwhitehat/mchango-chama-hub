
-- Fix Kings self help group: reverse double-commission on carry-forward
UPDATE chama SET available_balance = 100, total_commission_paid = 16 WHERE id = '835f94fd-a521-4e30-a017-8974ec576d5a';

-- Fix cycle 2 payment for member 12742757: should be 100 paid (not 95)
UPDATE member_cycle_payments 
SET amount_paid = 100, amount_remaining = 0, fully_paid = true, is_paid = true,
    payment_allocations = '[{"amount":100,"gross_credit_used":100,"commission":0,"commission_rate":0,"timestamp":"2026-04-05T19:02:59.929Z","source":"carry_forward","note":"Commission already deducted at overpayment deposit — corrected from double-charge"}]'::jsonb
WHERE id = '76f6b3fa-5e47-4d7f-9042-b1ee51d95012';

-- Update overpayment wallet: 100 of 114 was consumed, 14 remains
UPDATE chama_overpayment_wallet 
SET amount = 14, description = 'Partially applied: KES 100.00 to Cycle #2. KES 14.00 remaining.'
WHERE id = '1a678b48-253d-4967-a61e-ebee15ef7858';
