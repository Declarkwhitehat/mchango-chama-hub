
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deletion_reason text DEFAULT NULL;

COMMENT ON COLUMN public.profiles.deleted_at IS 'Soft-delete timestamp. Account is hidden after 45 days.';
COMMENT ON COLUMN public.profiles.deleted_by IS 'Admin who deleted the account.';
