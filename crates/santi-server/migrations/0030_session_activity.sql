-- D60 (SAN-198): last activity and a device label ("Chrome on macOS") per session; the raw
-- User-Agent and the address are never stored.
ALTER TABLE auth_token
    ADD COLUMN last_used_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN client text CHECK (char_length(client) <= 60);
UPDATE auth_token SET last_used_at = created_at;
