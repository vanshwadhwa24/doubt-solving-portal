# Database schema

PostgreSQL. Migrations live in `server/db/migrations/` and are applied by `npm run migrate` (tracked in `schema_migrations`).

## ER diagram

```mermaid
erDiagram
    users ||--o{ sessions : owns
    users ||--o{ doubts : asks
    courses ||--o{ doubts : categorizes
    doubts ||--o{ messages : contains
    users ||--o{ messages : sends
    doubts ||--o{ attachments : has
    messages ||--o{ attachments : carries

    users {
        bigint id PK
        text name
        text email UK
        text password_hash
        text role "student | educator"
        timestamptz created_at
    }
    courses {
        bigint id PK
        text code UK
        text name
    }
    sessions {
        bigint id PK
        bigint user_id FK
        text token_hash UK
        timestamptz expires_at
    }
    doubts {
        bigint id PK
        bigint student_id FK
        bigint course_id FK
        text title
        text description
        doubt_status status "open | in_progress | answered | resolved"
        text client_token "idempotency key, unique per student"
        bigint telegram_chat_id "set for Telegram-origin doubts"
        timestamptz created_at
        timestamptz updated_at
    }
    messages {
        bigint id PK
        bigint doubt_id FK
        bigint sender_id FK
        text body
        bigint telegram_msg_id "unique per doubt for sync dedupe"
        timestamptz created_at
    }
    attachments {
        bigint id PK
        bigint doubt_id FK
        bigint message_id FK "null when attached at creation"
        text file_path
        text original_name
        text mime_type
        int byte_size
    }
    telegram_updates {
        bigint update_id PK "processed bot updates, dedupe"
        timestamptz processed_at
    }
```

## Design notes

- **Idempotent doubt creation:** `UNIQUE (student_id, client_token)` makes a retried submission return the original doubt instead of a duplicate.
- **Conversation model:** a doubt holds the question; replies are ordered `messages`. Attachments hang off either the doubt (creation-time image) or a specific message.
- **Indexes** on `doubts(status)`, `doubts(course_id)`, `doubts(student_id)` and `messages(doubt_id, created_at)` keep inbox filtering and thread reads cheap as volume grows.
- **Sessions** store only the SHA-256 hash of the bearer token.

- **Migration 002** is data-only (no schema change): it sets legacy `answered` doubts whose last message is not from an educator to `in_progress` (or `open` if there are no messages).
