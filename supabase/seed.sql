-- Seed data for Chama & Mchango Platform
-- This file contains sample data for testing

-- Insert sample user (Profile will be created automatically via trigger when auth user is created)
-- For testing, you'll need to sign up through the app first, then use that user ID

-- Sample Mchango (replace USER_ID with actual user ID from profiles table)
-- To get user ID: SELECT id FROM profiles WHERE email = 'your-email@example.com';

INSERT INTO public.mchango (
  id,
  created_by,
  title,
  slug,
  description,
  goal_amount,
  current_amount,
  category,
  whatsapp_link,
  status
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.profiles LIMIT 1), -- Uses first user in profiles
  'Medical Emergency for Jane Doe',
  'medical-emergency-jane-doe',
  'Urgent fundraising campaign to cover medical expenses for Jane who was involved in a serious accident. Every contribution counts!',
  500000.00,
  125000.00,
  'Medical',
  'https://wa.me/254712345678',
  'active'
) ON CONFLICT (slug) DO NOTHING;

-- Sample Chama (replace USER_ID with actual user ID)
INSERT INTO public.chama (
  id,
  created_by,
  name,
  slug,
  description,
  contribution_amount,
  contribution_frequency,
  whatsapp_link,
  max_members,
  status
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.profiles LIMIT 1),
  'Tumaini Savings Group',
  'tumaini-savings-group',
  'A community savings group focused on helping members achieve their financial goals through regular contributions and mutual support.',
  5000.00,
  'weekly',
  'https://wa.me/254712345678',
  20,
  'active'
) ON CONFLICT (slug) DO NOTHING;

-- Insert 6 member codes for the Chama
-- Member 1 (the creator, who is also a manager)
INSERT INTO public.chama_members (
  chama_id,
  user_id,
  member_code,
  is_manager,
  status
) VALUES (
  (SELECT id FROM public.chama WHERE slug = 'tumaini-savings-group'),
  (SELECT id FROM public.profiles LIMIT 1),
  'TUM001',
  true,
  'active'
) ON CONFLICT (chama_id, member_code) DO NOTHING;

-- Member 2-6 (invited but not yet registered - user_id is NULL)
INSERT INTO public.chama_members (chama_id, member_code, is_manager, status) VALUES
  ((SELECT id FROM public.chama WHERE slug = 'tumaini-savings-group'), 'TUM002', false, 'active'),
  ((SELECT id FROM public.chama WHERE slug = 'tumaini-savings-group'), 'TUM003', false, 'active'),
  ((SELECT id FROM public.chama WHERE slug = 'tumaini-savings-group'), 'TUM004', false, 'active'),
  ((SELECT id FROM public.chama WHERE slug = 'tumaini-savings-group'), 'TUM005', false, 'active'),
  ((SELECT id FROM public.chama WHERE slug = 'tumaini-savings-group'), 'TUM006', false, 'active')
ON CONFLICT (chama_id, member_code) DO NOTHING;

-- Sample transaction for the Mchango
INSERT INTO public.transactions (
  user_id,
  mchango_id,
  amount,
  payment_reference,
  payment_method,
  status,
  transaction_type
) VALUES (
  (SELECT id FROM public.profiles LIMIT 1),
  (SELECT id FROM public.mchango WHERE slug = 'medical-emergency-jane-doe'),
  25000.00,
  'MPESA-REF-12345',
  'M-Pesa',
  'completed',
  'donation'
);

-- Sample contribution for the Chama
INSERT INTO public.contributions (
  chama_id,
  member_id,
  amount,
  payment_reference,
  status
) VALUES (
  (SELECT id FROM public.chama WHERE slug = 'tumaini-savings-group'),
  (SELECT id FROM public.chama_members WHERE member_code = 'TUM001' LIMIT 1),
  5000.00,
  'MPESA-REF-67890',
  'completed'
);

-- Sample audit log
INSERT INTO public.audit_logs (
  user_id,
  action,
  table_name,
  record_id,
  new_values
) VALUES (
  (SELECT id FROM public.profiles LIMIT 1),
  'CREATE',
  'mchango',
  (SELECT id FROM public.mchango WHERE slug = 'medical-emergency-jane-doe'),
  '{"title": "Medical Emergency for Jane Doe", "goal_amount": 500000}'::jsonb
);
