-- D45: which Terms of Use an account accepted, and when. Accounts made before stay NULL.
ALTER TABLE app_user
    ADD COLUMN terms_accepted_at timestamptz,
    ADD COLUMN terms_version     text;
