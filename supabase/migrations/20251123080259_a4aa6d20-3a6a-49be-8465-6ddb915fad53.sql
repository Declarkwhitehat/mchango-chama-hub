-- Phase 1: Critical RLS Policy Fixes for Security Enhancement

-- 1. Lock Down OTP Verifications Table
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can manage OTPs" ON public.otp_verifications;

-- Create restrictive service-role-only policies
CREATE POLICY "Only service role can read OTPs"
  ON public.otp_verifications
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Only service role can write OTPs"
  ON public.otp_verifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Only service role can update OTPs"
  ON public.otp_verifications
  FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Only service role can delete OTPs"
  ON public.otp_verifications
  FOR DELETE
  TO service_role
  USING (true);

-- 2. Lock Down Rate Limit Attempts Table
-- Drop the existing policy
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limit_attempts;

-- Create service-role-only policies
CREATE POLICY "Only service role can manage rate limits"
  ON public.rate_limit_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Fix Chat Messages Privacy
-- Drop the vulnerable policies that allow unauthenticated access
DROP POLICY IF EXISTS "Users can view their own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.chat_messages;

-- Create secure policies that REQUIRE authentication
CREATE POLICY "Authenticated users can view own messages"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can insert own messages"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated users can delete own messages"
  ON public.chat_messages
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());