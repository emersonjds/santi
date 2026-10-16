-- D45 (SAN-62 review): an erased account is marked by deleted_at and holds an email without '@',
-- which sign-up can never produce, so nobody can claim the address it will get.
ALTER TABLE app_user ADD COLUMN deleted_at timestamptz;

UPDATE app_user SET email = 'erased:' || id, deleted_at = now()
WHERE password_hash = '!' AND email = 'deleted-' || id || '@deleted.invalid';

ALTER TABLE app_user
    ADD CONSTRAINT app_user_erased_email CHECK ((deleted_at IS NULL) = (strpos(email, '@') > 0));

-- Erased accounts added to a project by email before this fix leave it; a project left without
-- an admin gets its member with the oldest account.
DELETE FROM member m USING app_user u WHERE u.id = m.user_id AND u.deleted_at IS NOT NULL;

UPDATE member m SET role = 'admin'
FROM (SELECT DISTINCT ON (project_id) project_id, user_id FROM member
      WHERE project_id NOT IN (SELECT project_id FROM member WHERE role = 'admin')
      ORDER BY project_id, user_id) heir
WHERE m.project_id = heir.project_id AND m.user_id = heir.user_id;
