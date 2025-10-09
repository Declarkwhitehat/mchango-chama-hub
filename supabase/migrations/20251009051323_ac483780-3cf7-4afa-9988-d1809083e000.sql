-- Create mchango_donations table to track all donations (guest + registered users)
CREATE TABLE IF NOT EXISTS public.mchango_donations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mchango_id uuid NOT NULL REFERENCES public.mchango(id) ON DELETE CASCADE,
  
  -- User info (NULL for guest donations)
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Guest donor info (required for guest donations)
  display_name text,
  phone text,
  email text,
  
  -- Donation details
  amount numeric NOT NULL CHECK (amount > 0),
  is_anonymous boolean NOT NULL DEFAULT false,
  
  -- Payment tracking
  payment_reference text NOT NULL UNIQUE,
  payment_method text,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed')),
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  
  -- Constraints: guest donations must have phone
  CONSTRAINT guest_donation_has_phone CHECK (
    user_id IS NOT NULL OR phone IS NOT NULL
  )
);

-- Enable RLS
ALTER TABLE public.mchango_donations ENABLE ROW LEVEL SECURITY;

-- Policies for mchango_donations
CREATE POLICY "Anyone can view donations for public mchangos"
ON public.mchango_donations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.mchango
    WHERE mchango.id = mchango_donations.mchango_id
    AND mchango.is_public = true
    AND mchango.status = 'active'
  )
);

CREATE POLICY "Authenticated users can create donations"
ON public.mchango_donations
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND
  (user_id = auth.uid() OR user_id IS NULL)
);

CREATE POLICY "Admins can view all donations"
ON public.mchango_donations
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Mchango creators can view their donations"
ON public.mchango_donations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.mchango
    WHERE mchango.id = mchango_donations.mchango_id
    AND mchango.created_by = auth.uid()
  )
);

-- Function to update mchango current_amount when donation is completed
CREATE OR REPLACE FUNCTION public.update_mchango_on_donation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'completed' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'completed') THEN
    UPDATE public.mchango
    SET current_amount = current_amount + NEW.amount
    WHERE id = NEW.mchango_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to update mchango amount on donation completion
CREATE TRIGGER on_donation_completed
AFTER INSERT OR UPDATE ON public.mchango_donations
FOR EACH ROW
EXECUTE FUNCTION public.update_mchango_on_donation();

-- Create index for faster queries
CREATE INDEX idx_mchango_donations_mchango_id ON public.mchango_donations(mchango_id);
CREATE INDEX idx_mchango_donations_user_id ON public.mchango_donations(user_id);
CREATE INDEX idx_mchango_donations_payment_status ON public.mchango_donations(payment_status);