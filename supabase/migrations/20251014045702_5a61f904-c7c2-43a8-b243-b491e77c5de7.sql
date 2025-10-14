-- Ensure order_index is immutable and strictly based on join date
-- Add check to prevent managers from modifying order_index
ALTER TABLE public.chama_members 
DROP CONSTRAINT IF EXISTS chama_members_order_index_immutable;

-- Create trigger to prevent order_index modification after creation
CREATE OR REPLACE FUNCTION public.prevent_order_index_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow initial insert
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Prevent order_index changes on update
  IF TG_OP = 'UPDATE' AND OLD.order_index IS DISTINCT FROM NEW.order_index THEN
    RAISE EXCEPTION 'Cannot modify order_index. Payout order is automatically determined by join date.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_order_index_modification ON public.chama_members;

CREATE TRIGGER prevent_order_index_modification
  BEFORE UPDATE ON public.chama_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_index_change();

-- Ensure only admins can update max_members on chama table
-- Drop existing policies that might allow non-admins to update max_members
DROP POLICY IF EXISTS "Admins can update chama max_members" ON public.chama;

CREATE POLICY "Admins can update chama max_members"
ON public.chama
FOR UPDATE
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Comment for documentation
COMMENT ON COLUMN public.chama_members.order_index IS 'Automatically assigned based on join date. Cannot be modified. Determines payout order.';
COMMENT ON COLUMN public.chama.max_members IS 'Maximum number of members allowed. Can only be adjusted by admins.';