-- Add file_path column to track storage location
ALTER TABLE public.generated_documents ADD COLUMN IF NOT EXISTS file_path text;

-- Create storage bucket for generated PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-pdfs', 'generated-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Admins can download any generated PDF
CREATE POLICY "Admins can view all generated pdfs"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-pdfs' AND public.has_role(auth.uid(), 'admin'));

-- Users can view their own generated PDFs
CREATE POLICY "Users can view own generated pdfs"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Authenticated users can upload generated PDFs to their own folder
CREATE POLICY "Users can upload generated pdfs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'generated-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Cleanup policy - allow deletion by admins
CREATE POLICY "Admins can delete generated pdfs"
ON storage.objects FOR DELETE
USING (bucket_id = 'generated-pdfs' AND public.has_role(auth.uid(), 'admin'));
