
-- Add missing foreign keys for welfare tables
ALTER TABLE public.welfare_members
  ADD CONSTRAINT welfare_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.welfare_contributions
  ADD CONSTRAINT welfare_contributions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.welfares
  ADD CONSTRAINT welfares_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Also add FK for withdrawals.requested_by if it exists and lacks FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'welfare_withdrawals' AND column_name = 'requested_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'welfare_withdrawals' AND ccu.column_name = 'requested_by' AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE public.welfare_withdrawals
      ADD CONSTRAINT welfare_withdrawals_requested_by_fkey
      FOREIGN KEY (requested_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
