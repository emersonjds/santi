CREATE TABLE sprint (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    board_id   bigint NOT NULL REFERENCES board (id) ON DELETE CASCADE,
    name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    goal       text NOT NULL DEFAULT '' CHECK (length(goal) <= 1000),
    state      text NOT NULL DEFAULT 'future' CHECK (state IN ('future', 'active', 'closed')),
    start_date date,
    end_date   date,
    started_at timestamptz,
    closed_at  timestamptz,
    CHECK (end_date >= start_date),                                                                    -- D12
    CHECK (state = 'future' OR (start_date IS NOT NULL AND end_date IS NOT NULL AND started_at IS NOT NULL)),
    CHECK ((state = 'closed') = (closed_at IS NOT NULL))
);

CREATE UNIQUE INDEX sprint_one_active_per_board ON sprint (board_id) WHERE state = 'active';             -- D13
CREATE INDEX sprint_board_idx ON sprint (board_id, id);

-- D32: deleting a (future) sprint returns its issues to the backlog in the same statement.
ALTER TABLE issue
    ADD CONSTRAINT issue_sprint_fk FOREIGN KEY (sprint_id) REFERENCES sprint (id) ON DELETE SET NULL;
