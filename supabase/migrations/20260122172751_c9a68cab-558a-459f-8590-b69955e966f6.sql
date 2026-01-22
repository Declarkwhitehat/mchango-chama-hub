-- Drop the existing constraint that requires min_members >= 5
ALTER TABLE public.chama DROP CONSTRAINT IF EXISTS chama_min_members_check;

-- Add new constraint that allows min_members >= 2
ALTER TABLE public.chama ADD CONSTRAINT chama_min_members_check CHECK (min_members >= 2);