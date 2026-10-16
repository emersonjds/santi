-- D40: deleting an issue. Subtasks are deleted with their parent by the service (a subtask
-- needs a parent); an epic's children stay, without an epic.
ALTER TABLE issue DROP CONSTRAINT issue_parent_id_fkey,
    ADD CONSTRAINT issue_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES issue (id) ON DELETE SET NULL;

-- A deleted issue's sprint facts stay, so a sprint still counts what it lost.
ALTER TABLE sprint_issue DROP CONSTRAINT sprint_issue_pkey,
    DROP CONSTRAINT sprint_issue_issue_id_fkey,
    ALTER COLUMN issue_id DROP NOT NULL,
    ADD CONSTRAINT sprint_issue_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issue (id) ON DELETE SET NULL,
    ADD CONSTRAINT sprint_issue_sprint_issue_key UNIQUE (sprint_id, issue_id);

CREATE OR REPLACE FUNCTION issue_touch_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'DELETE' THEN
        UPDATE issue SET updated_at = now() WHERE id = NEW.parent_id;
    END IF;
    IF TG_OP <> 'INSERT' THEN
        UPDATE issue SET updated_at = now() WHERE id = OLD.parent_id;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER issue_touch_parent_on_delete AFTER DELETE ON issue FOR EACH ROW
    WHEN (OLD.parent_id IS NOT NULL)
    EXECUTE FUNCTION issue_touch_parent();
