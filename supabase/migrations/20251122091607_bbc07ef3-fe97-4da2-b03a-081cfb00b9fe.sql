-- Update handle_new_user trigger function to provide better error messages for duplicates
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if phone already exists
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE phone = new.raw_user_meta_data->>'phone'
  ) THEN
    RAISE EXCEPTION 'This phone number is already registered. Please use a different number or log in.'
      USING ERRCODE = '23505'; -- Unique violation error code
  END IF;

  -- Check if ID number already exists
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id_number = new.raw_user_meta_data->>'id_number'
  ) THEN
    RAISE EXCEPTION 'This ID number is already registered. Please contact support if you believe this is an error.'
      USING ERRCODE = '23505';
  END IF;

  -- Insert new profile
  INSERT INTO public.profiles (id, full_name, id_number, phone, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'id_number',
    new.raw_user_meta_data->>'phone',
    new.email
  );
  
  -- Assign user role by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user');
  
  RETURN new;
END;
$function$;

-- Add unique constraint on email column in profiles table for extra safety
-- Using DO block to add constraint only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_email_unique'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
  END IF;
END $$;