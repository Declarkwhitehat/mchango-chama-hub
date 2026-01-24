-- Add is_verified column to chama table
ALTER TABLE public.chama
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- Add is_verified column to mchango table
ALTER TABLE public.mchango
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.chama.is_verified IS 'Indicates if the chama is verified by admin (blue badge)';
COMMENT ON COLUMN public.mchango.is_verified IS 'Indicates if the mchango campaign is verified by admin (blue badge)';