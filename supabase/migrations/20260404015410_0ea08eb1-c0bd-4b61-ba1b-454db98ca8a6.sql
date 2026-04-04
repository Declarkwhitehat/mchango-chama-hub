
ALTER TABLE public.chama_invite_codes
  ADD COLUMN IF NOT EXISTS max_uses integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;
