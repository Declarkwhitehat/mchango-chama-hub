-- Remove the duplicate foreign key constraint that's causing ambiguity
ALTER TABLE public.chama_members
DROP CONSTRAINT IF EXISTS fk_chama_members_user_id_profiles;