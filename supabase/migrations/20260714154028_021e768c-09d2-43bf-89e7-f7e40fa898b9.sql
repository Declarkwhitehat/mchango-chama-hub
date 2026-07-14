
-- =========================================================
-- 1. Clean up existing welfare duplicates (offline row that mirrors an STK row)
-- =========================================================
CREATE TEMP TABLE _wc_dupes ON COMMIT DROP AS
SELECT
  o.id           AS offline_id,
  s.id           AS stk_id,
  o.welfare_id,
  o.user_id,
  o.member_id,
  o.gross_amount,
  o.commission_amount,
  o.net_amount,
  o.created_at
FROM public.welfare_contributions o
JOIN public.welfare_contributions s
  ON  s.mpesa_receipt_number = o.payment_reference
  AND s.welfare_id = o.welfare_id
  AND s.user_id = o.user_id
  AND s.gross_amount = o.gross_amount
  AND s.payment_status = 'completed'
  AND s.payment_method = 'mpesa'
WHERE o.payment_status = 'completed'
  AND o.payment_method = 'mpesa_offline';

-- 1a. Roll back welfare group totals
WITH agg AS (
  SELECT welfare_id,
         SUM(gross_amount)      AS g,
         SUM(commission_amount) AS c,
         SUM(net_amount)        AS n
  FROM _wc_dupes
  GROUP BY welfare_id
)
UPDATE public.welfares w
SET total_gross_collected = GREATEST(COALESCE(w.total_gross_collected,0) - agg.g, 0),
    total_commission_paid = GREATEST(COALESCE(w.total_commission_paid,0) - agg.c, 0),
    available_balance     = GREATEST(COALESCE(w.available_balance,0)     - agg.n, 0),
    current_amount        = GREATEST(COALESCE(w.current_amount,0)        - agg.n, 0)
FROM agg
WHERE w.id = agg.welfare_id;

-- 1b. Roll back member total_contributed
WITH agg AS (
  SELECT member_id, SUM(gross_amount) AS g FROM _wc_dupes WHERE member_id IS NOT NULL GROUP BY member_id
)
UPDATE public.welfare_members m
SET total_contributed = GREATEST(COALESCE(m.total_contributed,0) - agg.g, 0)
FROM agg
WHERE m.id = agg.member_id;

-- 1c. Delete the duplicate company_earnings tied to the offline duplicates
DELETE FROM public.company_earnings ce
USING _wc_dupes d
WHERE ce.reference_id = d.offline_id;

-- 1d. Delete the duplicate financial_ledger rows (offline path wrote one per dupe row).
-- Match one ledger row per offline duplicate by welfare, gross_amount, and a close created_at window.
DELETE FROM public.financial_ledger fl
USING (
  SELECT DISTINCT ON (d.offline_id) fl2.id AS ledger_id, d.offline_id
  FROM _wc_dupes d
  JOIN public.financial_ledger fl2
    ON fl2.source_type = 'welfare'
   AND fl2.source_id = d.welfare_id
   AND fl2.gross_amount = d.gross_amount
   AND fl2.transaction_type = 'contribution'
   AND fl2.created_at BETWEEN d.created_at - interval '5 seconds' AND d.created_at + interval '5 seconds'
  ORDER BY d.offline_id, abs(extract(epoch from fl2.created_at - d.created_at))
) pick
WHERE fl.id = pick.ledger_id;

-- 1e. Delete the duplicate offline welfare_contributions rows
DELETE FROM public.welfare_contributions wc
USING _wc_dupes d
WHERE wc.id = d.offline_id;

-- =========================================================
-- 2. Backfill mpesa_receipt_number on remaining offline rows so the unique
--    guard applies to future writes regardless of which column stored the receipt.
-- =========================================================
UPDATE public.welfare_contributions
SET mpesa_receipt_number = payment_reference
WHERE payment_method = 'mpesa_offline'
  AND (mpesa_receipt_number IS NULL OR mpesa_receipt_number = '')
  AND payment_reference IS NOT NULL
  AND payment_reference !~ '^ws_CO_';

UPDATE public.mchango_donations
SET mpesa_receipt_number = payment_reference
WHERE payment_method IN ('mpesa_offline','mpesa')
  AND (mpesa_receipt_number IS NULL OR mpesa_receipt_number = '')
  AND payment_reference IS NOT NULL
  AND payment_reference !~ '^ws_CO_';

UPDATE public.organization_donations
SET mpesa_receipt_number = payment_reference
WHERE payment_method IN ('mpesa_offline','mpesa')
  AND (mpesa_receipt_number IS NULL OR mpesa_receipt_number = '')
  AND payment_reference IS NOT NULL
  AND payment_reference !~ '^ws_CO_';

UPDATE public.contributions
SET mpesa_receipt_number = payment_reference
WHERE (mpesa_receipt_number IS NULL OR mpesa_receipt_number = '')
  AND payment_reference IS NOT NULL
  AND payment_reference !~ '^ws_CO_'
  AND payment_reference !~ '^PAY-';

-- =========================================================
-- 3. Database-level guard: an M-Pesa receipt can appear at most once per table.
-- =========================================================
CREATE UNIQUE INDEX IF NOT EXISTS ux_welfare_contributions_mpesa_receipt
  ON public.welfare_contributions (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL AND mpesa_receipt_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_contributions_mpesa_receipt
  ON public.contributions (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL AND mpesa_receipt_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_mchango_donations_mpesa_receipt
  ON public.mchango_donations (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL AND mpesa_receipt_number <> '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_organization_donations_mpesa_receipt
  ON public.organization_donations (mpesa_receipt_number)
  WHERE mpesa_receipt_number IS NOT NULL AND mpesa_receipt_number <> '';
