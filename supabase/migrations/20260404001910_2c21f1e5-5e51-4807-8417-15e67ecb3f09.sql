
-- Create a shared documents table for all entity types
CREATE TABLE public.group_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('welfare', 'chama', 'mchango', 'organization')),
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.group_documents ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view documents for entities they can access
CREATE POLICY "Authenticated users can view group documents"
ON public.group_documents
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can upload documents
CREATE POLICY "Authenticated users can upload documents"
ON public.group_documents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uploaded_by);

-- Only admins can delete documents
CREATE POLICY "Only admins can delete documents"
ON public.group_documents
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for fast lookups
CREATE INDEX idx_group_documents_entity ON public.group_documents (entity_type, entity_id);

-- Create the storage bucket for group documents
INSERT INTO storage.buckets (id, name, public) VALUES ('group-documents', 'group-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload group documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'group-documents');

CREATE POLICY "Authenticated users can read group documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'group-documents');

CREATE POLICY "Admins can delete group documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'group-documents' AND has_role(auth.uid(), 'admin'::app_role));
