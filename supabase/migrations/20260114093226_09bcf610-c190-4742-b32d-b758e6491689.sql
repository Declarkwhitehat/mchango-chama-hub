-- Fix duplicate triggers causing amounts to be doubled

-- 1. Remove duplicate trigger on mchango_donations (keep on_donation_completed)
DROP TRIGGER IF EXISTS trigger_update_mchango_on_donation ON public.mchango_donations;

-- 2. Remove duplicate triggers on chama
DROP TRIGGER IF EXISTS trigger_enforce_admin_max_members ON public.chama;
DROP TRIGGER IF EXISTS trigger_enforce_admin_max_members_update ON public.chama;

-- 3. Remove duplicate trigger on chama_members
DROP TRIGGER IF EXISTS trigger_prevent_order_index_change ON public.chama_members;

-- 4. Remove duplicate trigger on member_cycle_payments
DROP TRIGGER IF EXISTS trigger_check_immediate_payout ON public.member_cycle_payments;

-- 5. Remove duplicate trigger on payment_methods
DROP TRIGGER IF EXISTS trigger_enforce_single_default_payment_method ON public.payment_methods;

-- 6. Remove duplicate triggers on saving_group_deposits (keep the ones without trigger_ prefix)
DROP TRIGGER IF EXISTS trigger_update_group_savings ON public.saving_group_deposits;
DROP TRIGGER IF EXISTS trigger_update_group_savings_on_deposit ON public.saving_group_deposits;
DROP TRIGGER IF EXISTS trigger_update_member_savings ON public.saving_group_deposits;
DROP TRIGGER IF EXISTS trigger_update_member_savings_on_deposit ON public.saving_group_deposits;

-- 7. Recalculate mchango current_amount from actual completed donations
UPDATE public.mchango m
SET current_amount = COALESCE(
  (SELECT SUM(amount) FROM public.mchango_donations 
   WHERE mchango_id = m.id AND payment_status = 'completed'), 
  0
);

-- 8. Recalculate organization current_amount from actual completed donations
UPDATE public.organizations o
SET current_amount = COALESCE(
  (SELECT SUM(amount) FROM public.organization_donations 
   WHERE organization_id = o.id AND payment_status = 'completed'), 
  0
);