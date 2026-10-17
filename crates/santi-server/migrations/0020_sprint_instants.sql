-- D48: dates become instants. The day boundary is the database's `timezone` setting
-- (ALTER DATABASE … SET timezone); sqlx opens every session with TimeZone=UTC, so read the catalog.
SELECT set_config('TimeZone', coalesce((
    SELECT substring(setting FROM '=(.*)$')
    FROM pg_db_role_setting, unnest(setconfig) AS setting
    WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND setrole = 0
      AND setting ILIKE 'timezone=%'
), 'UTC'), true);

ALTER TABLE sprint
    DROP CONSTRAINT sprint_check,
    ALTER COLUMN start_date TYPE timestamptz USING start_date + time '00:00',
    ALTER COLUMN end_date TYPE timestamptz USING end_date + time '23:59';
ALTER TABLE sprint RENAME COLUMN start_date TO starts_at;
ALTER TABLE sprint RENAME COLUMN end_date TO ends_at;
ALTER TABLE sprint ADD CONSTRAINT sprint_ends_after_start CHECK (ends_at > starts_at);

ALTER TABLE board ADD COLUMN sprint_length text
    CHECK (sprint_length ~ '^(4h|1d|1w|2w|1m|[1-9][0-9]{0,6})$');
