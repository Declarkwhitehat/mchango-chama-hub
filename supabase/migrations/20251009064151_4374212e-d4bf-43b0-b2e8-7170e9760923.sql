-- Scope chama_members policies to authenticated users to address linter warnings related to new policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chama_members'
      AND policyname = 'Only chama members can view member details'
  ) THEN
    EXECUTE 'DROP POLICY "Only chama members can view member details" ON public.chama_members;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chama_members'
      AND policyname = 'Managers can update members'
  ) THEN
    EXECUTE 'DROP POLICY "Managers can update members" ON public.chama_members;';
  END IF;
END $$;

CREATE POLICY "Only chama members can view member details"
ON public.chama_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR public.is_chama_manager(auth.uid(), chama_id)
);

CREATE POLICY "Managers can update members"
ON public.chama_members
FOR UPDATE
TO authenticated
USING (
  public.is_chama_manager(auth.uid(), chama_id)
);
