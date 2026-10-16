CREATE TABLE board_column (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id  bigint NOT NULL REFERENCES board (id) ON DELETE CASCADE,
    name      text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    position  integer NOT NULL,
    wip_limit integer CHECK (wip_limit > 0),                      -- D7: warns, never blocks
    CONSTRAINT board_column_position_key UNIQUE (board_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE status (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    category   text NOT NULL CHECK (category IN ('todo', 'in_progress', 'done')),
    -- D30: NULL = unmapped. No ON DELETE action: a column is deleted only after its statuses moved (D16).
    column_id  bigint REFERENCES board_column (id),
    UNIQUE (project_id, name)
);

CREATE INDEX status_column_idx ON status (column_id);
