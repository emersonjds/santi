-- Notifications (SAN-172): a mention, an assignment or a comment for the person it concerns.
CREATE TABLE notification (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_id bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    actor_id     bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    kind         text NOT NULL CHECK (kind IN ('mention', 'assigned', 'comment')),
    project_id   bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    issue_id     bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    comment_id   bigint REFERENCES issue_comment (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    read_at      timestamptz
);

CREATE INDEX notification_recipient_idx ON notification (recipient_id, read_at, id DESC);
CREATE INDEX notification_issue_idx ON notification (issue_id);
CREATE INDEX notification_comment_idx ON notification (comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX notification_list_idx ON notification (recipient_id, id DESC);
CREATE INDEX notification_project_idx ON notification (project_id);
CREATE INDEX notification_actor_idx ON notification (actor_id);
