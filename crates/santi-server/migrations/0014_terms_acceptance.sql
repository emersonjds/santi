-- D45: every acceptance of a legal document, append only. Rows are never updated or deleted,
-- not even with the account (its de-identified app_user row stays, D45).
CREATE TABLE legal_acceptance (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES app_user (id),
    document    text NOT NULL CHECK (document IN ('terms', 'privacy', 'age')),
    version     text NOT NULL CHECK (length(version) BETWEEN 1 AND 40),
    text_hash   text,
    accepted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX legal_acceptance_user_idx ON legal_acceptance (user_id, document, version);

CREATE FUNCTION legal_acceptance_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'legal_acceptance is append only';
END;
$$;

CREATE TRIGGER legal_acceptance_append_only
    BEFORE UPDATE OR DELETE ON legal_acceptance
    FOR EACH ROW EXECUTE FUNCTION legal_acceptance_append_only();
