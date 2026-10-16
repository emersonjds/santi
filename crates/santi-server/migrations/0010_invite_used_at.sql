-- Accepted invites stay as rows so a second visit can tell "used" (410) from "unknown" (404).
ALTER TABLE invite ADD COLUMN used_at timestamptz;
