-- SAN-230: when the account first closed the welcome tour; NULL opens it once.
-- Accounts that exist before the tour ships count as having seen it: the default
-- fills them without a table rewrite, then new rows start at NULL.
ALTER TABLE app_user ADD COLUMN tour_seen_at timestamptz DEFAULT now();
ALTER TABLE app_user ALTER COLUMN tour_seen_at DROP DEFAULT;
