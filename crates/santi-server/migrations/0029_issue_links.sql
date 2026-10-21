-- Typed links between issues (SAN-157, D59): one row per link, the inverse label is derived.
-- A pair carries each type once, in either direction.
CREATE TABLE issue_link (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id  bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    target_id  bigint NOT NULL REFERENCES issue (id) ON DELETE CASCADE,
    link_type  text NOT NULL CHECK (link_type IN ('blocks', 'relates', 'duplicates', 'clones')),
    created_by bigint NOT NULL REFERENCES app_user (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (source_id <> target_id)
);

CREATE UNIQUE INDEX issue_link_pair_key
    ON issue_link (least(source_id, target_id), greatest(source_id, target_id), link_type);
CREATE INDEX issue_link_source_idx ON issue_link (source_id);
CREATE INDEX issue_link_target_idx ON issue_link (target_id);
