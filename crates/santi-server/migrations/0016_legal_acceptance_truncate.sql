-- D45: TRUNCATE skips row triggers; the acceptance log refuses it too.
CREATE TRIGGER legal_acceptance_no_truncate
    BEFORE TRUNCATE ON legal_acceptance
    FOR EACH STATEMENT EXECUTE FUNCTION legal_acceptance_append_only();
