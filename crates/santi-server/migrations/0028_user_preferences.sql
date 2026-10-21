-- SAN-93: theme and time zone per account. A NULL zone means the browser's.
ALTER TABLE app_user
    ADD COLUMN theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    ADD COLUMN time_zone text;
