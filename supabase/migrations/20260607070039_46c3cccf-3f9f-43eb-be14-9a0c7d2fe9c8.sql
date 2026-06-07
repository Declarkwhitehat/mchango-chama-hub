
CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url text := 'https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/send-push-notification';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoaGNid2J2dWVpbWV6bXRmdHRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMzE5NzAsImV4cCI6MjA3NDkwNzk3MH0.uu8ltcznYrIzyxHCfDM40aLJBQE2dsY0OBTBv1n2rXE';
  v_title text := COALESCE(NEW.title, '');
  v_skip boolean := false;
BEGIN
  -- Suppress push for noisy categories / titles. In-app notification still saved.
  IF NEW.category = 'reminder' THEN
    -- Allow only the final-deadline reminders through
    IF v_title NOT ILIKE 'final reminder%' AND v_title NOT ILIKE '%final deadline%' THEN
      v_skip := true;
    END IF;
  END IF;

  IF v_title ILIKE 'new message%'
     OR v_title ILIKE 'new chat%'
     OR v_title ILIKE 'new contribution%'
     OR v_title ILIKE 'cycle opened%'
     OR v_title ILIKE 'cycle has started%'
     OR v_title ILIKE 'verification submitted%'
     OR v_title ILIKE 'kyc submitted%'
  THEN
    v_skip := true;
  END IF;

  IF v_skip THEN
    RETURN NEW;
  END IF;

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
    NULL;
  END;
  RETURN NEW;
END;
$function$;
