
-- Add deadline_days to welfare_contribution_cycles
ALTER TABLE public.welfare_contribution_cycles
ADD COLUMN IF NOT EXISTS deadline_days integer;

-- Add cycle_id to welfare_contributions to link contributions to cycles
ALTER TABLE public.welfare_contributions
ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES public.welfare_contribution_cycles(id);

-- Index for faster cycle lookups
CREATE INDEX IF NOT EXISTS idx_welfare_contributions_cycle_id ON public.welfare_contributions(cycle_id);

-- Allow welfare members to read contribution cycles for their welfare
CREATE POLICY "Welfare members can view contribution cycles"
ON public.welfare_contribution_cycles
FOR SELECT
TO authenticated
USING (
  public.is_welfare_member(auth.uid(), welfare_id)
);

-- Allow welfare members to read contributions for their welfare
CREATE POLICY "Welfare members can view welfare contributions"
ON public.welfare_contributions
FOR SELECT
TO authenticated
USING (
  public.is_welfare_member(auth.uid(), welfare_id)
);
