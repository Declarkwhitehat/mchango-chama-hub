-- Ensure pg_net is available for async HTTP from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function: fire-and-forget HTTP POST to the send-push-notification edge function
CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/send-push-notification';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoaGNid2J2dWVpbWV6bXRmdHRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMzE5NzAsImV4cCI6MjA3NDkwNzk3MH0.uu8ltcznYrIzyxHCfDM40aLJBQE2dsY0OBTBv1n2rXE';
BEGIN
  -- Best-effort async HTTP call; never block or fail the original insert
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'apikey', v_anon
      ),
      body := jsonb_build_object(
        'user_id', NEW.user_id::text,
        'title',   NEW.title,
        'body',    NEW.message,
        'data',    jsonb_build_object(
          'notification_id',     NEW.id::text,
          'category',            COALESCE(NEW.category, ''),
          'related_entity_id',   COALESCE(NEW.related_entity_id::text, ''),
          'related_entity_type', COALESCE(NEW.related_entity_type, ''),
          'type',                COALESCE(NEW.type, 'info')
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- swallow any pg_net errors so notifications insert always succeeds
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_push_after_insert ON public.notifications;

CREATE TRIGGER notifications_push_after_insert
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notify_push_on_notification_insert();