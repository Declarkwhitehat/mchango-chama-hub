
-- 1. Fraud Events table (immutable)
CREATE TABLE public.fraud_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_id uuid,
  rule_triggered text NOT NULL,
  risk_points_added integer NOT NULL DEFAULT 0,
  total_risk_score integer NOT NULL DEFAULT 0,
  ip_address text,
  device_info jsonb,
  metadata jsonb,
  admin_action text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_events ENABLE ROW LEVEL SECURITY;

-- Admins can view
CREATE POLICY "Admins can view fraud events"
ON public.fraud_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Service role inserts (open insert for service role calls)
CREATE POLICY "Service role can insert fraud events"
ON public.fraud_events FOR INSERT
WITH CHECK (true);

-- No UPDATE or DELETE policies = immutable

CREATE INDEX idx_fraud_events_user_id ON public.fraud_events(user_id);
CREATE INDEX idx_fraud_events_created_at ON public.fraud_events(created_at DESC);
CREATE INDEX idx_fraud_events_rule ON public.fraud_events(rule_triggered);

-- 2. Fraud Config table
CREATE TABLE public.fraud_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text UNIQUE NOT NULL,
  rule_value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fraud config"
ON public.fraud_config FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update fraud config"
ON public.fraud_config FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Seed data
INSERT INTO public.fraud_config (rule_key, rule_value, description) VALUES
  ('max_withdrawal_per_day', '{"value": 500000}', 'Maximum withdrawal amount per day (KES)'),
  ('max_transactions_per_hour', '{"value": 20}', 'Maximum transactions allowed per hour'),
  ('max_failed_logins', '{"value": 5}', 'Max failed login attempts before flagging'),
  ('max_failed_2fa_attempts', '{"value": 3}', 'Max failed 2FA attempts before flagging'),
  ('rapid_transaction_window_minutes', '{"value": 5}', 'Time window for rapid transaction detection (minutes)'),
  ('rapid_transaction_threshold', '{"value": 5}', 'Number of transactions in window to trigger alert'),
  ('abnormal_withdrawal_multiplier', '{"value": 3.0}', 'Multiplier of average to flag abnormal withdrawal'),
  ('device_detection_enabled', '{"value": true}', 'Enable device fingerprint detection');

-- 3. User Risk Profiles table
CREATE TABLE public.user_risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  risk_score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  is_flagged boolean NOT NULL DEFAULT false,
  is_frozen boolean NOT NULL DEFAULT false,
  frozen_at timestamptz,
  frozen_by uuid REFERENCES public.profiles(id),
  review_status text NOT NULL DEFAULT 'none',
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  last_risk_update timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view risk profiles"
ON public.user_risk_profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update risk profiles"
ON public.user_risk_profiles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert risk profiles"
ON public.user_risk_profiles FOR INSERT
WITH CHECK (true);

CREATE INDEX idx_user_risk_profiles_user_id ON public.user_risk_profiles(user_id);
CREATE INDEX idx_user_risk_profiles_risk_level ON public.user_risk_profiles(risk_level);
CREATE INDEX idx_user_risk_profiles_flagged ON public.user_risk_profiles(is_flagged) WHERE is_flagged = true;
