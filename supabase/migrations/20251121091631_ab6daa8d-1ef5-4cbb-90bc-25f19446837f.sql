-- Attach missing database triggers that were defined but never attached

-- 1. Trigger to update mchango current_amount when donations are completed
DROP TRIGGER IF EXISTS trigger_update_mchango_on_donation ON public.mchango_donations;
CREATE TRIGGER trigger_update_mchango_on_donation
  AFTER INSERT OR UPDATE ON public.mchango_donations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_mchango_on_donation();

-- 2. Trigger to enforce admin-only max_members updates on chama
DROP TRIGGER IF EXISTS trigger_enforce_admin_max_members ON public.chama;
CREATE TRIGGER trigger_enforce_admin_max_members
  BEFORE UPDATE ON public.chama
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_admin_max_members_update();

-- 3. Trigger to add creator as manager when chama is created (already exists, verify)
-- This should already be attached, but let's recreate it to be sure
DROP TRIGGER IF EXISTS trigger_add_creator_as_manager ON public.chama;
CREATE TRIGGER trigger_add_creator_as_manager
  AFTER INSERT ON public.chama
  FOR EACH ROW
  EXECUTE FUNCTION public.add_creator_as_manager();

-- 4. Trigger for immediate payout when all members paid
DROP TRIGGER IF EXISTS trigger_check_immediate_payout ON public.member_cycle_payments;
CREATE TRIGGER trigger_check_immediate_payout
  AFTER INSERT OR UPDATE ON public.member_cycle_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_immediate_payout();

-- 5. Trigger to update group savings on deposit
DROP TRIGGER IF EXISTS trigger_update_group_savings ON public.saving_group_deposits;
CREATE TRIGGER trigger_update_group_savings
  AFTER INSERT ON public.saving_group_deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_group_savings_on_deposit();

-- 6. Trigger to update member savings on deposit
DROP TRIGGER IF EXISTS trigger_update_member_savings ON public.saving_group_deposits;
CREATE TRIGGER trigger_update_member_savings
  AFTER INSERT ON public.saving_group_deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_member_savings_on_deposit();