ALTER TABLE public.welfares ALTER COLUMN loan_min_membership_months SET DEFAULT 3;
UPDATE public.welfares SET loan_min_membership_months = 3 WHERE loan_min_membership_months = 6;