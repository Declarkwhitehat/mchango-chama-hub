-- Fix Cycle 2 end_date: should be tomorrow 10PM Kenya = 2026-04-06 19:00 UTC
UPDATE contribution_cycles 
SET end_date = '2026-04-06T19:00:00+00'
WHERE id = '3a528569-d978-44b9-a686-3255770fc443';