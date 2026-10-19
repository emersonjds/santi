-- Who last changed a comment's text, and when (SAN-136, D52).
ALTER TABLE issue_comment
    ADD COLUMN edited_at timestamptz,
    ADD COLUMN edited_by bigint REFERENCES app_user (id),
    ADD CONSTRAINT issue_comment_edited_check CHECK ((edited_at IS NULL) = (edited_by IS NULL));
