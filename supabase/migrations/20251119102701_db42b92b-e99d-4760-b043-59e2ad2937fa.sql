-- Create storage bucket for campaign images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campaign-images', 'campaign-images', true);

-- RLS policy: Users can upload campaign images
CREATE POLICY "KYC approved users can upload campaign images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'campaign-images' 
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND kyc_status = 'approved'
    )
  );

-- RLS policy: Anyone can view campaign images (public bucket)
CREATE POLICY "Anyone can view campaign images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-images');

-- RLS policy: Users can update their own campaign images
CREATE POLICY "Users can update own campaign images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'campaign-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS policy: Users can delete their own campaign images
CREATE POLICY "Users can delete own campaign images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'campaign-images' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );