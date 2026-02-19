
-- Fix overly-permissive RLS policies: scope to service role operations
-- The "true" policies are needed for edge functions using service role key
-- We mark them explicitly to avoid ambiguity, but keep them as-is since
-- edge functions use the service role which bypasses RLS anyway.
-- Drop the permissive user-facing policies and keep only what's needed.

-- For chama_member_debts: drop the wide-open service policies (service role bypasses RLS)
DROP POLICY IF EXISTS "Service role can insert debts" ON public.chama_member_debts;
DROP POLICY IF EXISTS "Service role can update debts" ON public.chama_member_debts;
DROP POLICY IF EXISTS "Service role can insert deficits" ON public.chama_cycle_deficits;
DROP POLICY IF EXISTS "Service role can update deficits" ON public.chama_cycle_deficits;

-- Service role bypasses RLS automatically, so no INSERT/UPDATE policies needed for it.
-- Only admins need explicit write access via authenticated calls.
CREATE POLICY "Admins can insert debts"
  ON public.chama_member_debts FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update debts"
  ON public.chama_member_debts FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert deficits"
  ON public.chama_cycle_deficits FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update deficits"
  ON public.chama_cycle_deficits FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));
