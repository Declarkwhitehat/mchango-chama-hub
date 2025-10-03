-- Sample Mchango Seed Data
-- Run this after setting up your database and having at least one KYC-approved user

-- IMPORTANT: Replace the UUIDs below with actual user IDs from your profiles table
-- Get user IDs: SELECT id, full_name, kyc_status FROM profiles WHERE kyc_status = 'approved';

-- Sample Mchango 1: Medical Emergency
INSERT INTO public.mchango (
  title,
  description,
  slug,
  target_amount,
  current_amount,
  end_date,
  beneficiary_url,
  whatsapp_link,
  category,
  is_public,
  status,
  created_by,
  managers
) VALUES (
  'Medical Emergency Fund for Sarah',
  'Help Sarah cover her unexpected medical expenses after a recent accident. She needs funds for surgery and rehabilitation.',
  'medical-emergency-sarah',
  750000,
  0,
  NOW() + INTERVAL '60 days',
  'https://example.com/sarah-medical-fund',
  'https://wa.me/254712345678?text=I%20want%20to%20help%20Sarah',
  'medical',
  true,
  'active',
  (SELECT id FROM profiles WHERE kyc_status = 'approved' LIMIT 1),
  ARRAY[]::UUID[]
);

-- Sample Mchango 2: Education Support
INSERT INTO public.mchango (
  title,
  description,
  slug,
  target_amount,
  current_amount,
  end_date,
  beneficiary_url,
  whatsapp_link,
  category,
  is_public,
  status,
  created_by,
  managers
) VALUES (
  'University Fees for Bright Student',
  'John is a brilliant student who has been accepted to university but lacks the funds for tuition. Help him achieve his dreams of becoming an engineer.',
  'university-fees-john',
  450000,
  0,
  NOW() + INTERVAL '90 days',
  'https://example.com/john-education',
  'https://wa.me/254723456789?text=Supporting%20Johns%20education',
  'education',
  true,
  'active',
  (SELECT id FROM profiles WHERE kyc_status = 'approved' LIMIT 1),
  ARRAY[]::UUID[]
);

-- Sample Mchango 3: Small Business Startup
INSERT INTO public.mchango (
  title,
  description,
  slug,
  target_amount,
  current_amount,
  end_date,
  beneficiary_url,
  whatsapp_link,
  category,
  is_public,
  status,
  created_by,
  managers
) VALUES (
  'Mama Jane''s Vegetable Stand',
  'Help Mama Jane start her vegetable selling business. She needs funds for initial stock and a simple stand at the market.',
  'mama-jane-vegetable-stand',
  85000,
  0,
  NOW() + INTERVAL '30 days',
  NULL,
  'https://wa.me/254734567890?text=Business%20support',
  'business',
  true,
  'active',
  (SELECT id FROM profiles WHERE kyc_status = 'approved' LIMIT 1),
  ARRAY[]::UUID[]
);

-- Sample Mchango 4: Community Water Project
INSERT INTO public.mchango (
  title,
  description,
  slug,
  target_amount,
  current_amount,
  end_date,
  beneficiary_url,
  whatsapp_link,
  category,
  is_public,
  status,
  created_by,
  managers
) VALUES (
  'Clean Water for Kiambiu Village',
  'Our village needs a borehole to provide clean water to over 200 families. Help us build a sustainable water source.',
  'kiambiu-water-project',
  1500000,
  0,
  NOW() + INTERVAL '120 days',
  'https://example.com/kiambiu-water',
  'https://wa.me/254745678901?text=Water%20project%20support',
  'community',
  true,
  'active',
  (SELECT id FROM profiles WHERE kyc_status = 'approved' LIMIT 1),
  ARRAY[]::UUID[]
);

-- Sample Mchango 5: Private Family Emergency (Not Public)
INSERT INTO public.mchango (
  title,
  description,
  slug,
  target_amount,
  current_amount,
  end_date,
  beneficiary_url,
  whatsapp_link,
  category,
  is_public,
  status,
  created_by,
  managers
) VALUES (
  'Private Family Support Fund',
  'Confidential family emergency support. Only visible to selected managers.',
  'private-family-support',
  300000,
  0,
  NOW() + INTERVAL '45 days',
  NULL,
  NULL,
  'emergency',
  false,
  'active',
  (SELECT id FROM profiles WHERE kyc_status = 'approved' LIMIT 1),
  ARRAY[]::UUID[]
);

-- Sample Mchango 6: Completed Campaign (for testing)
INSERT INTO public.mchango (
  title,
  description,
  slug,
  target_amount,
  current_amount,
  end_date,
  beneficiary_url,
  whatsapp_link,
  category,
  is_public,
  status,
  created_by,
  managers
) VALUES (
  'School Books Drive - COMPLETED',
  'Successfully funded school books for 50 students. Thank you to all contributors!',
  'school-books-drive-completed',
  120000,
  120000,
  NOW() - INTERVAL '10 days',
  NULL,
  NULL,
  'education',
  true,
  'completed',
  (SELECT id FROM profiles WHERE kyc_status = 'approved' LIMIT 1),
  ARRAY[]::UUID[]
);

-- Verify inserted data
SELECT 
  title,
  slug,
  target_amount,
  current_amount,
  is_public,
  status,
  created_at
FROM public.mchango
ORDER BY created_at DESC;
