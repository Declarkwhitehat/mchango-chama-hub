-- Drop the old trigger that adds full amount on donation completion
-- We now handle this in the edge function with net amount
DROP TRIGGER IF EXISTS update_mchango_on_donation_trigger ON mchango_donations;

-- The function can remain but won't be called by trigger anymore
-- (keeping it in case it's used elsewhere)