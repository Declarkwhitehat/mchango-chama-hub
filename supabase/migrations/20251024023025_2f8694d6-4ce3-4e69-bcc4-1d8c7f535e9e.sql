-- Add FK for nested profile selection if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_chama_members_user_id_profiles'
  ) THEN
    ALTER TABLE public.chama_members
    ADD CONSTRAINT fk_chama_members_user_id_profiles
    FOREIGN KEY (user_id)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Allow managers to view profiles of members in their chamas (including pending)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Managers can view member profiles in their chamas'
  ) THEN
    CREATE POLICY "Managers can view member profiles in their chamas"
    ON public.profiles
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.chama_members cm_manager
        JOIN public.chama_members cm_member ON cm_manager.chama_id = cm_member.chama_id
        WHERE cm_manager.user_id = auth.uid()
          AND cm_manager.is_manager = true
          AND cm_member.user_id = profiles.id
      )
    );
  END IF;
END $$;