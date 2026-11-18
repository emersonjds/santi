-- SAN-199: the web app's language per account, a BCP 47 tag. Every account starts in English.
SET LOCAL lock_timeout = '5s';
ALTER TABLE app_user
    ADD COLUMN language text NOT NULL DEFAULT 'en'
        CHECK (language IN ('en', 'es', 'pt-BR', 'pt-PT', 'zh-CN'));
