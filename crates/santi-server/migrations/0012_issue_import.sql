-- D41: an imported issue keeps the key it had in the tool it came from; re-importing a file
-- skips rows whose key is already here.
ALTER TABLE issue
    ADD COLUMN external_source text CHECK (external_source IN ('jira', 'linear')),
    ADD COLUMN external_key    text CHECK (length(external_key) BETWEEN 1 AND 255),
    ADD CONSTRAINT issue_external_both CHECK ((external_source IS NULL) = (external_key IS NULL));

CREATE UNIQUE INDEX issue_external_key_idx ON issue (project_id, external_source, external_key)
    WHERE external_key IS NOT NULL;
