-- Change default status for chama table to 'pending'
ALTER TABLE chama ALTER COLUMN status SET DEFAULT 'pending'::chama_status;