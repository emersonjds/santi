ALTER TABLE issue ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE issue SET updated_at = created_at;

-- Triggers keep updated_at in one place, so no write path (service, FK cascade, sprint close) can
-- forget it and no request pays an extra round trip (D39). A write that sets updated_at itself wins.
CREATE FUNCTION issue_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

CREATE TRIGGER issue_touch BEFORE UPDATE ON issue FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.* AND OLD.updated_at = NEW.updated_at)
    EXECUTE FUNCTION issue_touch();

-- A child added under or moved between parents changes what each parent shows.
CREATE FUNCTION issue_touch_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE issue SET updated_at = now() WHERE id = NEW.parent_id;
    IF TG_OP = 'UPDATE' THEN
        UPDATE issue SET updated_at = now() WHERE id = OLD.parent_id;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER issue_touch_parent_on_insert AFTER INSERT ON issue FOR EACH ROW
    WHEN (NEW.parent_id IS NOT NULL)
    EXECUTE FUNCTION issue_touch_parent();

CREATE TRIGGER issue_touch_parent_on_update AFTER UPDATE OF parent_id ON issue FOR EACH ROW
    WHEN (OLD.parent_id IS DISTINCT FROM NEW.parent_id)
    EXECUTE FUNCTION issue_touch_parent();

CREATE FUNCTION issue_comment_touch_issue() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE issue SET updated_at = now() WHERE id = NEW.issue_id;
    RETURN NULL;
END $$;

CREATE TRIGGER issue_comment_touch_issue AFTER INSERT ON issue_comment FOR EACH ROW
    EXECUTE FUNCTION issue_comment_touch_issue();
