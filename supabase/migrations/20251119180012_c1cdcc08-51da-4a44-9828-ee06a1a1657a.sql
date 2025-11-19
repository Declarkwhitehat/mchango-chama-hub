-- Create storage bucket for chama PDF reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('chama-reports', 'chama-reports', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy for authenticated users to upload reports
CREATE POLICY "Authenticated users can upload chama reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chama-reports');

-- RLS policy for anyone to read reports (public bucket)
CREATE POLICY "Anyone can read chama reports"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chama-reports');