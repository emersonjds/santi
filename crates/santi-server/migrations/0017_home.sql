-- SAN-72 home ("For you"). A project's star and last visit live on the membership, so leaving the
-- project drops them.
ALTER TABLE member ADD COLUMN starred_at timestamptz, ADD COLUMN visited_at timestamptz;

CREATE TABLE issue_star (
    user_id    bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    issue_id   bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, issue_id)
);

CREATE INDEX issue_star_issue_idx ON issue_star (issue_id);

-- The caller's last view and last write (create, edit, move, comment) of an issue, one row each.
CREATE TABLE issue_activity (
    user_id   bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    issue_id  bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    viewed_at timestamptz,
    worked_at timestamptz,
    PRIMARY KEY (user_id, issue_id)
);

CREATE INDEX issue_activity_issue_idx ON issue_activity (issue_id);
CREATE INDEX issue_activity_viewed_idx ON issue_activity (user_id, viewed_at DESC) WHERE viewed_at IS NOT NULL;
CREATE INDEX issue_activity_worked_idx ON issue_activity (user_id, worked_at DESC) WHERE worked_at IS NOT NULL;
CREATE INDEX issue_assignee_updated_idx ON issue (assignee_id, updated_at DESC) WHERE assignee_id IS NOT NULL;

INSERT INTO issue_activity (user_id, issue_id, worked_at)
SELECT user_id, issue_id, max(at) FROM (
    SELECT reporter_id AS user_id, id AS issue_id, created_at AS at FROM issue
    UNION ALL
    SELECT author_id, issue_id, created_at FROM issue_comment
) work
WHERE user_id IN (SELECT id FROM app_user WHERE deleted_at IS NULL)
GROUP BY user_id, issue_id;
