
-- Create sequence for serial numbers
CREATE SEQUENCE public.document_serial_seq START WITH 10000001;

-- Create table for tracking generated documents
CREATE TABLE public.generated_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_number BIGINT NOT NULL UNIQUE DEFAULT nextval('public.document_serial_seq'),
  document_type TEXT NOT NULL,
  document_title TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  generated_by UUID NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

-- Admins can view all
CREATE POLICY "Admins can view all generated documents"
ON public.generated_documents FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own
CREATE POLICY "Users can view own generated documents"
ON public.generated_documents FOR SELECT
USING (auth.uid() = generated_by);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can create document records"
ON public.generated_documents FOR INSERT TO authenticated
WITH CHECK (auth.uid() = generated_by);

-- Index for serial number lookups
CREATE INDEX idx_generated_documents_serial ON public.generated_documents (serial_number);
CREATE INDEX idx_generated_documents_type ON public.generated_documents (document_type);
CREATE INDEX idx_generated_documents_entity ON public.generated_documents (entity_type, entity_id);
