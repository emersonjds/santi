CREATE TABLE app_user (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         text NOT NULL UNIQUE CHECK (email = lower(email)),
    display_name  text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- D22/D23: web sessions and personal API tokens share one table; only the SHA-256 is stored.
CREATE TABLE auth_token (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('session', 'api')),
    name       text CHECK (length(name) BETWEEN 1 AND 100),
    token_hash bytea NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    CHECK (kind <> 'session' OR expires_at IS NOT NULL),
    CHECK (kind <> 'api' OR (name IS NOT NULL AND expires_at IS NULL))
);

CREATE INDEX auth_token_user_kind_idx ON auth_token (user_id, kind);
