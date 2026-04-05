
-- Allow members to update their own cycle payment records
CREATE POLICY "Members can update their own cycle payments"
ON public.member_cycle_payments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM chama_members
    WHERE chama_members.id = member_cycle_payments.member_id
      AND chama_members.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM chama_members
    WHERE chama_members.id = member_cycle_payments.member_id
      AND chama_members.user_id = auth.uid()
  )
);

-- Allow managers to update cycle payments for members in their chamas
CREATE POLICY "Managers can update cycle payments in their chamas"
ON public.member_cycle_payments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM chama_members cm
    JOIN contribution_cycles cc ON cc.id = member_cycle_payments.cycle_id
    WHERE cm.chama_id = cc.chama_id
      AND cm.user_id = auth.uid()
      AND cm.is_manager = true
  )
);

-- Allow admins full update access
CREATE POLICY "Admins can update all cycle payments"
ON public.member_cycle_payments
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));
