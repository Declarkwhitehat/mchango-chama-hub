-- Create withdrawals table to track withdrawal requests
CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chama_id uuid REFERENCES public.chama(id),
  mchango_id uuid REFERENCES public.mchango(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  amount numeric NOT NULL CHECK (amount > 0),
  commission_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL CHECK (net_amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid REFERENCES auth.users(id),
  rejection_reason text,
  payment_reference text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT check_chama_or_mchango CHECK (
    (chama_id IS NOT NULL AND mchango_id IS NULL) OR
    (chama_id IS NULL AND mchango_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- Creators can view their own withdrawal requests
CREATE POLICY "Creators can view their withdrawals"
ON public.withdrawals
FOR SELECT
USING (auth.uid() = requested_by);

-- Creators can create withdrawal requests
CREATE POLICY "Creators can request withdrawals"
ON public.withdrawals
FOR INSERT
WITH CHECK (
  auth.uid() = requested_by AND
  (
    (chama_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.chama 
      WHERE id = withdrawals.chama_id AND created_by = auth.uid()
    )) OR
    (mchango_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.mchango 
      WHERE id = withdrawals.mchango_id AND created_by = auth.uid()
    ))
  )
);

-- Admins can view all withdrawals
CREATE POLICY "Admins can view all withdrawals"
ON public.withdrawals
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update withdrawals
CREATE POLICY "Admins can update withdrawals"
ON public.withdrawals
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Members can view withdrawals for their chama
CREATE POLICY "Members can view chama withdrawals"
ON public.withdrawals
FOR SELECT
USING (
  chama_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_id = withdrawals.chama_id 
    AND user_id = auth.uid()
    AND approval_status = 'approved'
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_withdrawals_updated_at
BEFORE UPDATE ON public.withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for withdrawals
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawals;