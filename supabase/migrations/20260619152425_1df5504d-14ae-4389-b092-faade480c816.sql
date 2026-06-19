-- Phase 1: Add super_admin enum value (must commit before use)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';