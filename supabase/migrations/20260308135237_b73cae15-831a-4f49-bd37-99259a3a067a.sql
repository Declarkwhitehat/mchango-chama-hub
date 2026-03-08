
-- Create chama_messages table for in-app group chat
CREATE TABLE public.chama_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chama_id UUID NOT NULL REFERENCES public.chama(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_announcement BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chama_messages ENABLE ROW LEVEL SECURITY;

-- Only active approved chama members can read messages
CREATE POLICY "Members can view chama messages"
ON public.chama_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_members.chama_id = chama_messages.chama_id
      AND chama_members.user_id = auth.uid()
      AND chama_members.status = 'active'::member_status
      AND chama_members.approval_status = 'approved'
  )
);

-- Only active approved chama members can send messages
CREATE POLICY "Members can send chama messages"
ON public.chama_messages
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.chama_members
    WHERE chama_members.chama_id = chama_messages.chama_id
      AND chama_members.user_id = auth.uid()
      AND chama_members.status = 'active'::member_status
      AND chama_members.approval_status = 'approved'
  )
);

-- Only managers can set is_announcement = true (use trigger)
CREATE OR REPLACE FUNCTION public.check_announcement_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_announcement = true THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chama_members
      WHERE chama_members.chama_id = NEW.chama_id
        AND chama_members.user_id = NEW.user_id
        AND chama_members.is_manager = true
        AND chama_members.status = 'active'::member_status
        AND chama_members.approval_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Only managers can create announcements';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_announcement_before_insert
BEFORE INSERT ON public.chama_messages
FOR EACH ROW EXECUTE FUNCTION public.check_announcement_permission();

-- Admins can view all messages
CREATE POLICY "Admins can view all chama messages"
ON public.chama_messages
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chama_messages;

-- Create member_trust_scores table
CREATE TABLE public.member_trust_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  total_chamas_completed INTEGER NOT NULL DEFAULT 0,
  total_on_time_payments INTEGER NOT NULL DEFAULT 0,
  total_late_payments INTEGER NOT NULL DEFAULT 0,
  total_missed_payments INTEGER NOT NULL DEFAULT 0,
  total_outstanding_debts INTEGER NOT NULL DEFAULT 0,
  trust_score INTEGER NOT NULL DEFAULT 50,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.member_trust_scores ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read trust scores
CREATE POLICY "Authenticated users can view trust scores"
ON public.member_trust_scores
FOR SELECT
TO authenticated
USING (true);

-- Only service role can insert/update (via edge function)
CREATE POLICY "Service role can manage trust scores"
ON public.member_trust_scores
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create index for fast lookups
CREATE INDEX idx_chama_messages_chama_id ON public.chama_messages(chama_id, created_at DESC);
CREATE INDEX idx_member_trust_scores_user_id ON public.member_trust_scores(user_id);
