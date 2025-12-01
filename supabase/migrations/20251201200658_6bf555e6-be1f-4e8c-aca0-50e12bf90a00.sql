-- Drop the duplicate trigger that's causing chama creation to fail
DROP TRIGGER IF EXISTS trigger_add_creator_as_manager ON chama;