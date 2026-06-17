DROP POLICY IF EXISTS "Anyone can read maintenance flags" ON public.platform_settings;
CREATE POLICY "Anyone can read public settings"
ON public.platform_settings
FOR SELECT
USING (setting_key = ANY (ARRAY['maintenance_mode','maintenance_title','maintenance_message','user_verification_fee']));