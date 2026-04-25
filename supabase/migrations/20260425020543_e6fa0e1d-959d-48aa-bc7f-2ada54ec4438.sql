UPDATE public.mchango
SET slug = regexp_replace(regexp_replace(lower(trim(slug)), '-+', '-', 'g'), '^-+|-+$', '', 'g')
WHERE slug ~ '(^-|-$|--)';