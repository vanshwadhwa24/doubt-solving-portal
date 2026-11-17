-- Doubt Solving Portal - initial schema
-- Students submit doubts against courses; educators answer in threads.

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('student', 'educator')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
    id   BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE sessions (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TYPE doubt_status AS ENUM ('open', 'in_progress', 'answered', 'resolved');

CREATE TABLE doubts (
    id               BIGSERIAL PRIMARY KEY,
    student_id       BIGINT NOT NULL REFERENCES users (id),
    course_id        BIGINT NOT NULL REFERENCES courses (id),
    title            TEXT,
    description      TEXT NOT NULL,
    status           doubt_status NOT NULL DEFAULT 'open',
    -- Idempotency: the client generates one token per intended doubt so a
    -- retried submission returns the original instead of creating a double.
    client_token     TEXT,
    -- Populated when the doubt originates from the Telegram bot.
    telegram_chat_id BIGINT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, client_token)
);
CREATE INDEX idx_doubts_status ON doubts (status);
CREATE INDEX idx_doubts_course ON doubts (course_id);
CREATE INDEX idx_doubts_student ON doubts (student_id);

CREATE TABLE messages (
    id                 BIGSERIAL PRIMARY KEY,
    doubt_id           BIGINT NOT NULL REFERENCES doubts (id) ON DELETE CASCADE,
    sender_id          BIGINT REFERENCES users (id),
    body               TEXT NOT NULL,
    telegram_msg_id    BIGINT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Telegram sync dedupe: one row per (doubt, telegram message).
    UNIQUE (doubt_id, telegram_msg_id)
);
CREATE INDEX idx_messages_doubt ON messages (doubt_id, created_at);

CREATE TABLE attachments (
    id            BIGSERIAL PRIMARY KEY,
    doubt_id      BIGINT NOT NULL REFERENCES doubts (id) ON DELETE CASCADE,
    message_id    BIGINT REFERENCES messages (id) ON DELETE CASCADE,
    file_path     TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    byte_size     INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_doubt ON attachments (doubt_id);

-- Telegram webhook/polling dedupe: each bot update is processed at most once.
CREATE TABLE telegram_updates (
    update_id    BIGINT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
