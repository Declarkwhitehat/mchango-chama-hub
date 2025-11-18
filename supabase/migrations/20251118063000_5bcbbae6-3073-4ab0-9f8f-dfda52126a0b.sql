-- Create customer_callbacks table for AI chatbot callback requests
CREATE TABLE IF NOT EXISTS public.customer_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  phone_number TEXT NOT NULL,
  question TEXT NOT NULL,
  conversation_history JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.customer_callbacks ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert callback requests
CREATE POLICY "Anyone can create callback requests"
  ON public.customer_callbacks
  FOR INSERT
  WITH CHECK (true);

-- Policy: Admins can view all callbacks
CREATE POLICY "Admins can view all callbacks"
  ON public.customer_callbacks
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Policy: Admins can update callbacks
CREATE POLICY "Admins can update callbacks"
  ON public.customer_callbacks
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index on status for faster filtering
CREATE INDEX idx_customer_callbacks_status ON public.customer_callbacks(status);

-- Create index on created_at for sorting
CREATE INDEX idx_customer_callbacks_created_at ON public.customer_callbacks(created_at DESC);