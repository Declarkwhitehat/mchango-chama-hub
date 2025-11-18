-- Add missing database triggers that were defined but not attached

-- Trigger for updating mchango amount on donation completion
CREATE TRIGGER trigger_update_mchango_on_donation
  AFTER INSERT OR UPDATE ON mchango_donations
  FOR EACH ROW
  EXECUTE FUNCTION update_mchango_on_donation();

-- Trigger for enforcing admin-only max_members updates on chama
CREATE TRIGGER trigger_enforce_admin_max_members_update
  BEFORE UPDATE ON chama
  FOR EACH ROW
  EXECUTE FUNCTION enforce_admin_max_members_update();

-- Trigger for preventing order_index changes on chama_members
CREATE TRIGGER trigger_prevent_order_index_change
  BEFORE UPDATE ON chama_members
  FOR EACH ROW
  EXECUTE FUNCTION prevent_order_index_change();

-- Trigger for adding creator as manager when chama is created
CREATE TRIGGER trigger_add_creator_as_manager
  AFTER INSERT ON chama
  FOR EACH ROW
  EXECUTE FUNCTION add_creator_as_manager();

-- Trigger for updating group savings when deposit is made
CREATE TRIGGER trigger_update_group_savings_on_deposit
  AFTER INSERT ON saving_group_deposits
  FOR EACH ROW
  EXECUTE FUNCTION update_group_savings_on_deposit();

-- Trigger for updating member savings when deposit is made
CREATE TRIGGER trigger_update_member_savings_on_deposit
  AFTER INSERT ON saving_group_deposits
  FOR EACH ROW
  EXECUTE FUNCTION update_member_savings_on_deposit();

-- Trigger for enforcing single default payment method per user
CREATE TRIGGER trigger_enforce_single_default_payment_method
  BEFORE INSERT OR UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_default_payment_method();

-- Drop duplicate/deprecated function
DROP FUNCTION IF EXISTS calculate_loan_pool_available(uuid);