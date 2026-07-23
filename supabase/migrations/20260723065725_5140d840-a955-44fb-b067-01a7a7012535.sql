
CREATE OR REPLACE FUNCTION public.schedule_welfare_payout_trigger(
  _withdrawal_id uuid,
  _run_at timestamptz,
  _url text,
  _apikey text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_name text := 'welfare-payout-' || _withdrawal_id::text;
  ts timestamptz;
  cron_spec text;
  cmd text;
BEGIN
  ts := _run_at AT TIME ZONE 'UTC';
  IF ts <= (now() AT TIME ZONE 'UTC') THEN
    ts := (now() AT TIME ZONE 'UTC') + interval '1 minute';
  END IF;

  cron_spec := to_char(ts, 'MI HH24 DD MM') || ' *';

  BEGIN
    PERFORM cron.unschedule(job_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  cmd := format(
    'SELECT net.http_post(url:=%L, headers:=jsonb_build_object(''Content-Type'',''application/json'',''apikey'',%L,''Authorization'',''Bearer '' || %L), body:=jsonb_build_object(''withdrawal_id'', %L)); SELECT cron.unschedule(%L);',
    _url, _apikey, _apikey, _withdrawal_id::text, job_name
  );

  PERFORM cron.schedule(job_name, cron_spec, cmd);
  RETURN job_name;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_welfare_payout_trigger(uuid, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_welfare_payout_trigger(uuid, timestamptz, text, text) TO service_role;
