
CREATE OR REPLACE FUNCTION public.cleanup_expired_documents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.generated_documents
  WHERE created_at < (now() - interval '3 months');
END;
$$;
