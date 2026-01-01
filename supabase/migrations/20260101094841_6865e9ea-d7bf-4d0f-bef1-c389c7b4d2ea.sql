-- Add YouTube link and additional images to mchango table
ALTER TABLE public.mchango 
ADD COLUMN IF NOT EXISTS youtube_url TEXT,
ADD COLUMN IF NOT EXISTS image_url_2 TEXT,
ADD COLUMN IF NOT EXISTS image_url_3 TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.mchango.youtube_url IS 'YouTube video URL for campaign story';
COMMENT ON COLUMN public.mchango.image_url_2 IS 'Second campaign image URL';
COMMENT ON COLUMN public.mchango.image_url_3 IS 'Third campaign image URL';