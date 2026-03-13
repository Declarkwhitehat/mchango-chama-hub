
-- 1. Replace welfare member code generator with sequential version
CREATE OR REPLACE FUNCTION public.generate_welfare_member_code(p_welfare_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_code TEXT;
  v_next_number INTEGER;
  v_full_code TEXT;
  v_exists BOOLEAN;
BEGIN
  SELECT group_code INTO v_group_code FROM welfares WHERE id = p_welfare_id;
  IF v_group_code IS NULL THEN v_group_code := 'WF00'; END IF;

  -- Find the next sequential number
  SELECT COALESCE(MAX(
    CASE
      WHEN member_code ~ ('^' || v_group_code || 'M[0-9]+$')
      THEN CAST(substring(member_code from length(v_group_code) + 2) AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO v_next_number
  FROM welfare_members
  WHERE welfare_id = p_welfare_id;

  v_full_code := v_group_code || 'M' || lpad(v_next_number::text, 4, '0');

  -- Ensure uniqueness
  SELECT EXISTS(
    SELECT 1 FROM welfare_members WHERE welfare_id = p_welfare_id AND member_code = v_full_code
  ) INTO v_exists;

  WHILE v_exists LOOP
    v_next_number := v_next_number + 1;
    v_full_code := v_group_code || 'M' || lpad(v_next_number::text, 4, '0');
    SELECT EXISTS(
      SELECT 1 FROM welfare_members WHERE welfare_id = p_welfare_id AND member_code = v_full_code
    ) INTO v_exists;
  END LOOP;

  RETURN v_full_code;
END;
$function$;

-- 2. Add constitution columns to welfares table
ALTER TABLE public.welfares
  ADD COLUMN IF NOT EXISTS constitution_file_path TEXT,
  ADD COLUMN IF NOT EXISTS constitution_file_name TEXT,
  ADD COLUMN IF NOT EXISTS constitution_uploaded_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS constitution_uploaded_at TIMESTAMPTZ;

-- 3. Create welfare-documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('welfare-documents', 'welfare-documents', false)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage RLS: authenticated users can read files for their welfares
CREATE POLICY "Welfare members can read documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'welfare-documents'
  AND public.is_welfare_member(auth.uid(), (storage.foldername(name))[1]::uuid)
);

-- 5. Storage RLS: executives can upload
CREATE POLICY "Welfare executives can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'welfare-documents'
  AND public.get_welfare_role(auth.uid(), (storage.foldername(name))[1]::uuid) IN ('chairman', 'secretary', 'treasurer')
);

-- 6. Storage RLS: only admins can delete (for re-upload flow)
CREATE POLICY "Admins can delete welfare documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'welfare-documents'
  AND public.has_role(auth.uid(), 'admin')
);
