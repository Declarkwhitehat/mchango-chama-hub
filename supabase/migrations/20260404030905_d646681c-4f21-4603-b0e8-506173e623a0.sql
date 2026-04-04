-- Create the missing first contribution cycle with grace period
INSERT INTO public.contribution_cycles (
  chama_id, cycle_number, start_date, end_date, due_amount,
  beneficiary_member_id, total_expected_amount, total_collected_amount,
  members_paid_count, members_skipped_count
)
SELECT 
  '835f94fd-a521-4e30-a017-8974ec576d5a',
  1,
  '2026-04-04T03:02:05.162Z',
  (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '22 hours')::timestamptz,
  c.contribution_amount,
  (SELECT id FROM chama_members WHERE chama_id = '835f94fd-a521-4e30-a017-8974ec576d5a' AND order_index = 1),
  c.contribution_amount * 6,
  0,
  0,
  0
FROM chama c WHERE c.id = '835f94fd-a521-4e30-a017-8974ec576d5a';

-- Create member_cycle_payments for all 6 members
INSERT INTO public.member_cycle_payments (member_id, cycle_id, amount_due, amount_paid, amount_remaining, is_paid, fully_paid, is_late_payment, payment_allocations)
SELECT 
  cm.id,
  cc.id,
  cc.due_amount,
  0,
  cc.due_amount,
  false,
  false,
  false,
  '[]'::jsonb
FROM chama_members cm
CROSS JOIN contribution_cycles cc
WHERE cm.chama_id = '835f94fd-a521-4e30-a017-8974ec576d5a'
  AND cc.chama_id = '835f94fd-a521-4e30-a017-8974ec576d5a'
  AND cc.cycle_number = 1
  AND cm.status = 'active'
  AND cm.approval_status = 'approved';