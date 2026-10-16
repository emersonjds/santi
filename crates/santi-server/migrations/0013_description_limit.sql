-- Descriptions are capped like summaries and comments (64 KiB of characters, SAN-51).
ALTER TABLE issue ADD CONSTRAINT issue_description_length CHECK (length(description) <= 65536);
