CREATE UNIQUE INDEX IF NOT EXISTS unique_chama_member_debt_per_cycle
ON public.chama_member_debts (member_id, cycle_id);