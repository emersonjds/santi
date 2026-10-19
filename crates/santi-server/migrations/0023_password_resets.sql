-- Operator-made password reset links (SAN-171). The primary key keeps one live link per account.
CREATE TABLE password_reset (
    user_id    bigint PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
