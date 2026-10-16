-- Written while a sprint runs and at close, so later edits never rewrite a closed sprint.
CREATE TABLE sprint_issue (
    sprint_id         bigint NOT NULL REFERENCES sprint (id) ON DELETE CASCADE,
    issue_id          bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    added_after_start boolean NOT NULL,
    points_at_start   double precision,
    outcome           text CHECK (outcome IN ('completed', 'not_completed', 'removed')),
    points_at_close   double precision,
    PRIMARY KEY (sprint_id, issue_id)
);

CREATE INDEX sprint_issue_issue_idx ON sprint_issue (issue_id);
