INSERT INTO public.platform_settings (setting_key, setting_value, description)
VALUES
  ('maintenance_mode', '{"enabled": false}'::jsonb, 'Controls whether the platform is in maintenance mode'),
  ('maintenance_title', '{"text": "Scheduled maintenance"}'::jsonb, 'Title shown to users during maintenance mode'),
  ('maintenance_message', '{"text": "We are doing upgrades and system maintenance. Please check back shortly."}'::jsonb, 'Message shown to users during maintenance mode')
ON CONFLICT (setting_key) DO NOTHING;