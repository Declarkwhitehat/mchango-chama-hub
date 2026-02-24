
-- Drop the mchango donation trigger that causes double-counting
DROP TRIGGER IF EXISTS on_donation_completed ON public.mchango_donations;
DROP FUNCTION IF EXISTS public.update_mchango_on_donation();

-- Drop the organization donation trigger (correct trigger name)
DROP TRIGGER IF EXISTS update_org_amount_trigger ON public.organization_donations;
DROP FUNCTION IF EXISTS public.update_org_on_donation();

-- Recalculate all mchango balances from actual completed donations
UPDATE public.mchango m SET
  current_amount = COALESCE(sub.total_net, 0),
  available_balance = COALESCE(sub.total_net, 0),
  total_gross_collected = COALESCE(sub.total_gross, 0),
  total_commission_paid = COALESCE(sub.total_commission, 0)
FROM (
  SELECT 
    mchango_id,
    SUM(COALESCE(net_amount, amount)) as total_net,
    SUM(COALESCE(gross_amount, amount)) as total_gross,
    SUM(COALESCE(commission_amount, 0)) as total_commission
  FROM public.mchango_donations
  WHERE payment_status = 'completed'
  GROUP BY mchango_id
) sub WHERE m.id = sub.mchango_id;

-- Zero out campaigns with no completed donations
UPDATE public.mchango SET
  current_amount = 0, available_balance = 0,
  total_gross_collected = 0, total_commission_paid = 0
WHERE id NOT IN (
  SELECT DISTINCT mchango_id FROM public.mchango_donations WHERE payment_status = 'completed'
) AND (current_amount > 0 OR total_gross_collected > 0);

-- Recalculate all organization balances
UPDATE public.organizations o SET
  current_amount = COALESCE(sub.total_net, 0),
  available_balance = COALESCE(sub.total_net, 0),
  total_gross_collected = COALESCE(sub.total_gross, 0),
  total_commission_paid = COALESCE(sub.total_commission, 0)
FROM (
  SELECT 
    organization_id,
    SUM(COALESCE(net_amount, amount)) as total_net,
    SUM(COALESCE(gross_amount, amount)) as total_gross,
    SUM(COALESCE(commission_amount, 0)) as total_commission
  FROM public.organization_donations
  WHERE payment_status = 'completed'
  GROUP BY organization_id
) sub WHERE o.id = sub.organization_id;

-- Zero out organizations with no completed donations
UPDATE public.organizations SET
  current_amount = 0, available_balance = 0,
  total_gross_collected = 0, total_commission_paid = 0
WHERE id NOT IN (
  SELECT DISTINCT organization_id FROM public.organization_donations WHERE payment_status = 'completed'
) AND (current_amount > 0 OR total_gross_collected > 0);

-- Account for completed withdrawals
UPDATE public.mchango m SET
  current_amount = GREATEST(0, m.current_amount - COALESCE(w.total_withdrawn, 0)),
  available_balance = GREATEST(0, m.available_balance - COALESCE(w.total_withdrawn, 0))
FROM (
  SELECT mchango_id, SUM(net_amount) as total_withdrawn
  FROM public.withdrawals
  WHERE mchango_id IS NOT NULL AND status = 'completed'
  GROUP BY mchango_id
) w WHERE m.id = w.mchango_id;

UPDATE public.organizations o SET
  current_amount = GREATEST(0, o.current_amount - COALESCE(w.total_withdrawn, 0)),
  available_balance = GREATEST(0, o.available_balance - COALESCE(w.total_withdrawn, 0))
FROM (
  SELECT organization_id, SUM(net_amount) as total_withdrawn
  FROM public.withdrawals
  WHERE organization_id IS NOT NULL AND status = 'completed'
  GROUP BY organization_id
) w WHERE o.id = w.organization_id;
