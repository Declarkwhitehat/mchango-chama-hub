-- Keep only last 3 days of cron run history
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days' OR end_time IS NULL;

SELECT cron.schedule(
  'purge-cron-run-details-daily',
  '0 1 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'$$
);