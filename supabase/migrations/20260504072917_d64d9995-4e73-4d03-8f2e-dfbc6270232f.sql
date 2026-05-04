-- 1. Unschedule the email queue cron job
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'process-email-queue';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

-- 2. Drop pgmq queues (auth_emails, transactional_emails, and their DLQs)
DO $$
BEGIN
  BEGIN PERFORM pgmq.drop_queue('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM pgmq.drop_queue('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM pgmq.drop_queue('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM pgmq.drop_queue('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 3. Drop email tables
DROP TABLE IF EXISTS public.email_send_log CASCADE;
DROP TABLE IF EXISTS public.email_send_state CASCADE;
DROP TABLE IF EXISTS public.suppressed_emails CASCADE;
DROP TABLE IF EXISTS public.email_unsubscribe_tokens CASCADE;

-- 4. Drop email helper functions
DROP FUNCTION IF EXISTS public.enqueue_email(text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.read_email_batch(text, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.delete_email(text, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.move_to_dlq(text, text, bigint, jsonb) CASCADE;

-- 5. Remove the vault secret used by the cron job (if present)
DO $$
BEGIN
  BEGIN
    PERFORM vault.delete_secret(id) FROM vault.secrets WHERE name = 'email_queue_service_role_key';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;