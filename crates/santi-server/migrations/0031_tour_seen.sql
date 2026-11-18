-- SAN-230: when the account first closed the welcome tour; NULL opens it once.
-- Accounts that exist before the tour ships count as having seen it.
ALTER TABLE app_user ADD COLUMN tour_seen_at timestamptz;
UPDATE app_user SET tour_seen_at = now();
