-- SAN-70: a project is active, archived (read-only) or trashed (404, purged after 60 days).
-- Reversible: ALTER TABLE project DROP CONSTRAINT project_lifecycle_one_state,
-- DROP COLUMN archived_at, DROP COLUMN archived_by, DROP COLUMN trashed_at, DROP COLUMN trashed_by.
ALTER TABLE project
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN archived_by bigint REFERENCES app_user (id) ON DELETE SET NULL,
    ADD COLUMN trashed_at  timestamptz,
    ADD COLUMN trashed_by  bigint REFERENCES app_user (id) ON DELETE SET NULL,
    ADD CONSTRAINT project_lifecycle_one_state CHECK (archived_at IS NULL OR trashed_at IS NULL);
