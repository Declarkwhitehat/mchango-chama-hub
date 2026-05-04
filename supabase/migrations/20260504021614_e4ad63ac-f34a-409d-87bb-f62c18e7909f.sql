-- Add deletion workflow columns to group_documents
ALTER TABLE public.group_documents
  ADD COLUMN IF NOT EXISTS deletion_status text,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_by uuid,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reason text,
  ADD COLUMN IF NOT EXISTS deletion_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_cancelled_by uuid;

CREATE INDEX IF NOT EXISTS idx_group_documents_pending_deletion
  ON public.group_documents (deletion_status, deletion_scheduled_for)
  WHERE deletion_status = 'pending';

-- Helper to detect manager role across entity types
CREATE OR REPLACE FUNCTION public.is_entity_manager(_user_id uuid, _entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is boolean := false;
BEGIN
  IF _entity_type = 'chama' THEN
    SELECT public.is_chama_manager(_user_id, _entity_id) INTO v_is;
  ELSIF _entity_type = 'welfare' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.welfare_members
      WHERE welfare_id = _entity_id AND user_id = _user_id AND status = 'active'
        AND role IN ('chairman','secretary','treasurer')
    ) INTO v_is;
  ELSIF _entity_type = 'mchango' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.mchango
      WHERE id = _entity_id
        AND (created_by = _user_id OR _user_id = ANY(COALESCE(managers, ARRAY[]::uuid[])))
    ) INTO v_is;
  ELSIF _entity_type = 'organization' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = _entity_id AND created_by = _user_id
    ) INTO v_is;
  END IF;
  RETURN COALESCE(v_is, false);
END;
$$;

-- RLS: allow managers to UPDATE deletion fields; admins to UPDATE/DELETE
DROP POLICY IF EXISTS "Managers can request deletion" ON public.group_documents;
CREATE POLICY "Managers can request deletion"
ON public.group_documents
FOR UPDATE
TO authenticated
USING (public.is_entity_manager(auth.uid(), entity_type, entity_id))
WITH CHECK (public.is_entity_manager(auth.uid(), entity_type, entity_id));

DROP POLICY IF EXISTS "Admins can manage all documents" ON public.group_documents;
CREATE POLICY "Admins can manage all documents"
ON public.group_documents
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));