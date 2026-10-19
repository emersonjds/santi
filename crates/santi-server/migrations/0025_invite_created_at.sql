-- SAN-177: invites listed with when they were made. Older invites all lasted 7 days.
ALTER TABLE invite ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
UPDATE invite SET created_at = expires_at - interval '7 days';
