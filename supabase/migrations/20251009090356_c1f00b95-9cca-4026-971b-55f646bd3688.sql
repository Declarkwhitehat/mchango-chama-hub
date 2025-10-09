-- Add paid_by_member_id to track who actually made the payment
ALTER TABLE public.contributions
ADD COLUMN paid_by_member_id uuid REFERENCES public.chama_members(id);

-- Add notes field for additional context
ALTER TABLE public.contributions
ADD COLUMN payment_notes text;

-- Update existing contributions to set paid_by_member_id same as member_id
UPDATE public.contributions
SET paid_by_member_id = member_id
WHERE paid_by_member_id IS NULL;

-- Enable realtime for contributions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.contributions;