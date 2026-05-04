DO $$
BEGIN
  PERFORM cron.unschedule('process-document-deletions-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'process-document-deletions-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://ahhcbwbvueimezmtftte.supabase.co/functions/v1/process-document-deletions',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoaGNid2J2dWVpbWV6bXRmdHRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMzE5NzAsImV4cCI6MjA3NDkwNzk3MH0.uu8ltcznYrIzyxHCfDM40aLJBQE2dsY0OBTBv1n2rXE"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);