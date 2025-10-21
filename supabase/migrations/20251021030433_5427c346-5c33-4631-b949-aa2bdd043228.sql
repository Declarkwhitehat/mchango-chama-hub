-- Allow approved members and managers to view their chama details
CREATE POLICY "Approved members can view their chama"
ON public.chama
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members cm
    WHERE cm.chama_id = chama.id
      AND cm.user_id = auth.uid()
      AND cm.approval_status = 'approved'
      AND cm.status = 'active'
  )
  OR public.is_chama_manager(auth.uid(), id)
);
