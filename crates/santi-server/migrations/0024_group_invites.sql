-- Group invite links (SAN-176): one link lets up to max_uses people join, each join recorded.
-- invite.used_at is set when the last spot is taken; older used invites have no invite_use rows.
ALTER TABLE invite ADD COLUMN max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 50);

CREATE TABLE invite_use (
    invite_id bigint NOT NULL REFERENCES invite (id) ON DELETE CASCADE,
    user_id   bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    used_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (invite_id, user_id)
);

CREATE INDEX invite_use_user_id ON invite_use (user_id);
