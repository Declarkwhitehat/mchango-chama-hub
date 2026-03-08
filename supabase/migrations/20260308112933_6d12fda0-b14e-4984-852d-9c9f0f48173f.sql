CREATE POLICY "Welfare executives can create wf approvals"
ON public.welfare_withdrawal_approvals
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.withdrawals w
    WHERE w.id = welfare_withdrawal_approvals.withdrawal_id
      AND w.welfare_id = welfare_withdrawal_approvals.welfare_id
      AND w.requested_by = auth.uid()
      AND w.status = 'pending_approval'
  )
  AND decision = 'pending'
  AND rejection_reason IS NULL
  AND approver_role IN ('secretary', 'treasurer')
  AND EXISTS (
    SELECT 1
    FROM public.welfare_members wm
    WHERE wm.id = welfare_withdrawal_approvals.approver_id
      AND wm.welfare_id = welfare_withdrawal_approvals.welfare_id
      AND wm.status = 'active'
      AND wm.role IN ('secretary', 'treasurer')
  )
);