CREATE TABLE project (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key               text NOT NULL UNIQUE CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
    name              text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    next_issue_number bigint NOT NULL DEFAULT 1,               -- D20
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE member (
    project_id bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    user_id    bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    role       text NOT NULL CHECK (role IN ('admin', 'member')),
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX member_user_idx ON member (user_id);

-- D31: exactly one board per project; its type never changes (KB-8 dropped).
CREATE TABLE board (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id         bigint NOT NULL UNIQUE REFERENCES project (id) ON DELETE CASCADE,
    board_type         text NOT NULL CHECK (board_type IN ('scrum', 'kanban')),
    done_window_days   integer CHECK (done_window_days IN (7, 14, 30)),   -- D8; NULL = never hide
    next_sprint_number bigint NOT NULL DEFAULT 1                          -- D12
);

CREATE TABLE invite (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    role       text NOT NULL CHECK (role IN ('admin', 'member')),
    token_hash bytea NOT NULL UNIQUE,
    created_by bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE INDEX invite_project_idx ON invite (project_id);
