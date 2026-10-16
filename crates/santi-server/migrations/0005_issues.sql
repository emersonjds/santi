CREATE TABLE issue (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    number      bigint NOT NULL,                                                        -- D20: KEY-N
    issue_type  text NOT NULL CHECK (issue_type IN ('epic', 'story', 'task', 'bug', 'subtask')),
    summary     text NOT NULL CHECK (length(summary) BETWEEN 1 AND 255),
    description text NOT NULL DEFAULT '',
    priority    text NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
    status_id   bigint NOT NULL REFERENCES status (id),                                -- SB-6: a held status cannot be deleted
    assignee_id bigint REFERENCES app_user (id) ON DELETE SET NULL,
    reporter_id bigint NOT NULL REFERENCES app_user (id),
    points      double precision CHECK (points >= 0),
    labels      text[] NOT NULL DEFAULT '{}',
    parent_id   bigint REFERENCES issue (id),
    sprint_id   bigint,                                                                 -- foreign key added with the sprint table (Task 7)
    rank        text COLLATE "C" NOT NULL,                                              -- D21: sorts bytewise, like Rust
    done_at     timestamptz,                                                            -- D8
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, number),
    UNIQUE (project_id, rank),
    CHECK (issue_type <> 'subtask' OR (points IS NULL AND parent_id IS NOT NULL)),      -- D11, D6
    CHECK (issue_type <> 'epic' OR parent_id IS NULL)
);

CREATE INDEX issue_status_idx ON issue (status_id);
CREATE INDEX issue_parent_idx ON issue (parent_id);
CREATE INDEX issue_sprint_idx ON issue (sprint_id);
CREATE INDEX issue_assignee_idx ON issue (project_id, assignee_id);
CREATE INDEX issue_labels_idx ON issue USING gin (labels);
CREATE INDEX issue_summary_trgm_idx ON issue USING gin (summary gin_trgm_ops);
