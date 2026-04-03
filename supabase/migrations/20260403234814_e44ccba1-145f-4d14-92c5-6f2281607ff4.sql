
-- Predefined security questions
CREATE TABLE public.security_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read security questions"
  ON public.security_questions FOR SELECT
  TO authenticated
  USING (true);

-- User PINs
CREATE TABLE public.user_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own pin record"
  ON public.user_pins FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pin"
  ON public.user_pins FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pin"
  ON public.user_pins FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- User security answers
CREATE TABLE public.user_security_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.security_questions(id),
  answer_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id)
);

ALTER TABLE public.user_security_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own security answers"
  ON public.user_security_answers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own security answers"
  ON public.user_security_answers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own security answers"
  ON public.user_security_answers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own security answers"
  ON public.user_security_answers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Seed security questions
INSERT INTO public.security_questions (question_text) VALUES
  ('What is the name of your first pet?'),
  ('What city were you born in?'),
  ('What is your mother''s maiden name?'),
  ('What was the name of your first school?'),
  ('What is your favorite childhood food?'),
  ('What was the make of your first car?'),
  ('What is the name of your best childhood friend?'),
  ('What street did you grow up on?'),
  ('What is your favorite teacher''s name?'),
  ('What is the middle name of your oldest sibling?');

-- Trigger for updated_at on user_pins
CREATE TRIGGER update_user_pins_updated_at
  BEFORE UPDATE ON public.user_pins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
