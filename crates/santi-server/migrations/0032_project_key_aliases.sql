-- SAN-225: a project's previous keys keep resolving until its admin removes them. Live keys and
-- aliases share one namespace, kept by `pg_advisory_xact_lock(hashtext('project-key:' || key))`
-- around every write that assigns or aliases a key.
CREATE TABLE project_key_alias (
    key        text PRIMARY KEY CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
    project_id bigint NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_key_alias_project ON project_key_alias (project_id, created_at DESC);

-- The project a key names: its live key, else one of its previous keys.
CREATE FUNCTION resolve_project_key(wanted text) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT coalesce((SELECT id FROM project WHERE key = wanted),
                    (SELECT project_id FROM project_key_alias WHERE key = wanted))
$$;
