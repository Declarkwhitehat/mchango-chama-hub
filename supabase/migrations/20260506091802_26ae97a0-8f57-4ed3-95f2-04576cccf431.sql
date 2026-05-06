
SELECT cron.unschedule(jobid) FROM cron.job
 WHERE jobname IN (
   'cleanup-old-chat-messages-weekly',
   'cleanup-expired-documents-weekly',
   'cleanup-failed-transactions-weekly',
   'compute-trust-scores-daily',
   'financial-reconciliation-6hr',
   'financial-reconciliation-daily'
 );

SELECT cron.schedule('cleanup-old-chat-messages-weekly','0 3 * * 0',$$ SELECT public.cleanup_old_chat_messages(); $$);
SELECT cron.schedule('cleanup-expired-documents-weekly','0 2 * * 0',$$ SELECT public.cleanup_expired_documents(); $$);
SELECT cron.schedule('cleanup-failed-transactions-weekly','0 23 * * 0',$$ SELECT public.cleanup_failed_transactions(); $$);
SELECT cron.schedule('compute-trust-scores-daily','0 3 * * *',$$ SELECT public.compute_trust_scores(); $$);
SELECT cron.schedule('financial-reconciliation-daily','0 1 * * *',$$ SELECT public.financial_reconciliation(); $$);
