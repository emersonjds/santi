-- Files on issues and comments (SAN-158, D53); the bytes live in storage under storage_key.
-- The unique (issue_id, id) replaces the keyset index and lets an attachment's comment be
-- checked to belong to its issue.
ALTER TABLE issue_comment ADD CONSTRAINT issue_comment_issue_id_id_key UNIQUE (issue_id, id);
DROP INDEX issue_comment_issue_idx;

CREATE TABLE attachment (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id     bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    comment_id   bigint,
    uploader_id  bigint NOT NULL REFERENCES app_user (id),
    file_name    text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
    content_type text NOT NULL,
    size_bytes   bigint NOT NULL CHECK (size_bytes >= 0),
    storage_key  text NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (issue_id, comment_id) REFERENCES issue_comment (issue_id, id) ON DELETE CASCADE
);

CREATE INDEX attachment_issue_idx ON attachment (issue_id, id);
CREATE INDEX attachment_comment_idx ON attachment (comment_id) WHERE comment_id IS NOT NULL;
