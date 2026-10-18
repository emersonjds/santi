-- Comment bodies share the description cap (64 KiB of characters, SAN-135, D50).
ALTER TABLE issue_comment DROP CONSTRAINT issue_comment_body_check;
ALTER TABLE issue_comment ADD CONSTRAINT issue_comment_body_check CHECK (length(body) BETWEEN 1 AND 65536);
