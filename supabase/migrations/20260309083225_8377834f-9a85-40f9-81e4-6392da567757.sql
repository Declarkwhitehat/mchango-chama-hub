
CREATE UNIQUE INDEX unique_chama_name ON public.chama (lower(trim(name)));
CREATE UNIQUE INDEX unique_mchango_title ON public.mchango (lower(trim(title)));
CREATE UNIQUE INDEX unique_organization_name ON public.organizations (lower(trim(name)));
CREATE UNIQUE INDEX unique_welfare_name ON public.welfares (lower(trim(name)));
