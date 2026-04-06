
-- Platform settings table for configurable commission rates etc.
CREATE TABLE public.platform_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view platform settings"
ON public.platform_settings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update platform settings"
ON public.platform_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert platform settings"
ON public.platform_settings FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed default commission rates
INSERT INTO public.platform_settings (setting_key, setting_value, description) VALUES
  ('commission_rate_chama', '{"rate": 0.05}'::jsonb, 'Chama on-time commission rate (5%)'),
  ('commission_rate_mchango', '{"rate": 0.07}'::jsonb, 'Mchango campaign commission rate (7%)'),
  ('commission_rate_organization', '{"rate": 0.05}'::jsonb, 'Organization donation commission rate (5%)'),
  ('commission_rate_welfare', '{"rate": 0.05}'::jsonb, 'Welfare contribution commission rate (5%)');

-- Trigger for updated_at
CREATE TRIGGER update_platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
