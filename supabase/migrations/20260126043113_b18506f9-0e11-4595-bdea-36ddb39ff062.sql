-- Create verification requests table
CREATE TABLE public.verification_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('chama', 'mchango', 'organization')),
  entity_id UUID NOT NULL,
  requested_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  request_reason TEXT,
  supporting_documents TEXT[],
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create verification requests for their own entities"
ON public.verification_requests FOR INSERT
WITH CHECK (
  auth.uid() = requested_by AND
  (
    (entity_type = 'chama' AND EXISTS (SELECT 1 FROM chama WHERE id = entity_id AND created_by = auth.uid())) OR
    (entity_type = 'mchango' AND EXISTS (SELECT 1 FROM mchango WHERE id = entity_id AND created_by = auth.uid())) OR
    (entity_type = 'organization' AND EXISTS (SELECT 1 FROM organizations WHERE id = entity_id AND created_by = auth.uid()))
  )
);

CREATE POLICY "Users can view their own verification requests"
ON public.verification_requests FOR SELECT
USING (auth.uid() = requested_by);

CREATE POLICY "Admins can view all verification requests"
ON public.verification_requests FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update verification requests"
ON public.verification_requests FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete verification requests"
ON public.verification_requests FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_verification_requests_updated_at
BEFORE UPDATE ON public.verification_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create unique constraint to prevent duplicate pending requests
CREATE UNIQUE INDEX unique_pending_request 
ON public.verification_requests (entity_type, entity_id) 
WHERE status = 'pending';