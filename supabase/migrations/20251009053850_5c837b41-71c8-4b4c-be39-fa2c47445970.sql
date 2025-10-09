-- Add admin access policy for ID documents storage
CREATE POLICY "Admins can manage all ID documents"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'id-documents' 
  AND has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'id-documents' 
  AND has_role(auth.uid(), 'admin')
);