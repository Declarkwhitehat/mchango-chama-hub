
-- Delete simulation data for chama 42f8737b-b275-4050-bca1-45f6220ca314
-- Fixed order: delete withdrawals before contribution_cycles

DELETE FROM public.chama_cycle_deficits WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.chama_member_debts WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.member_cycle_payments WHERE cycle_id IN (SELECT id FROM public.contribution_cycles WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314');
DELETE FROM public.payout_approval_requests WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.contributions WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.withdrawals WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.contribution_cycles WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.chama_messages WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.chama_invite_codes WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.chama_rejoin_requests WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.chama_member_removals WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.chama_cycle_history WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.chama_members WHERE chama_id = '42f8737b-b275-4050-bca1-45f6220ca314';
DELETE FROM public.chama WHERE id = '42f8737b-b275-4050-bca1-45f6220ca314';
