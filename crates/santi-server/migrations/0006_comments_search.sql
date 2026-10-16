CREATE TABLE issue_comment (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id   bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    author_id  bigint NOT NULL REFERENCES app_user (id),
    body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX issue_comment_issue_idx ON issue_comment (issue_id, id);   -- keyset pages (D29)
CREATE INDEX issue_project_id_idx ON issue (project_id, id);            -- search keyset pages (D29)
CREATE INDEX issue_project_type_idx ON issue (project_id, issue_type);  -- type filter (D3)
