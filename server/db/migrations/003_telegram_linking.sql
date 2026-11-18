-- Telegram: each student links their own chat to their portal account.
ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT UNIQUE;

-- One-time codes a signed-in student sends to the bot (/start CODE) to link a chat.
CREATE TABLE telegram_link_codes (
    code       TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_telegram_link_codes_user ON telegram_link_codes (user_id);
-- Finds a chat's open conversation quickly.
CREATE INDEX idx_doubts_tg_chat ON doubts (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
