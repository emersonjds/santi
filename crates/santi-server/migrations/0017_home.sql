-- SAN-72 home ("For you").
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
CREATE INDEX issue_assignee_only_idx ON issue (assignee_id) WHERE assignee_id IS NOT NULL;

INSERT INTO issue_activity (user_id, issue_id, worked_at)
SELECT work.user_id, work.issue_id, max(work.at) FROM (
    SELECT reporter_id AS user_id, id AS issue_id, project_id, created_at AS at FROM issue
    UNION ALL
    SELECT c.author_id, c.issue_id, i.project_id, c.created_at
    FROM issue_comment c JOIN issue i ON i.id = c.issue_id
) work
WHERE EXISTS (SELECT 1 FROM member m WHERE m.project_id = work.project_id AND m.user_id = work.user_id)
GROUP BY work.user_id, work.issue_id;

-- Last: it locks member for writes until the migration commits. A project's star and last visit
-- live on the membership, so leaving the project drops them.
ALTER TABLE member ADD COLUMN starred_at timestamptz, ADD COLUMN visited_at timestamptz;
