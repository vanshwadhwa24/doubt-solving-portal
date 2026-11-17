# DoubtDesk - Doubt Solving Portal

A centralized portal where students submit academic doubts and educators manage and answer them from a single dashboard. Built as an EdTech/LMS MVP: instead of doubts getting buried in WhatsApp/Telegram groups, every question becomes a tracked conversation with a status.

**Stack:** React (Vite) frontend · Node.js (Express) REST API · PostgreSQL database.

## Features

**Students**
- Submit a doubt against a course/subject, with an optional image/screenshot
- See all their past doubts and track each one's status
- Read educator answers and continue the conversation in a thread

**Educators**
- One inbox for every incoming doubt, with live counts (unanswered, open, in progress, answered, resolved)
- Filter by course and status; free-text search over questions, replies and student names
- Open a doubt to see the complete conversation history
- Reply in the thread; update statuses (Open, In Progress, Answered, Resolved)

**Telegram bridge (optional, bonus)**
- With a bot token set, students can send doubts to a Telegram bot; they appear in the educator inbox and educator answers are pushed back to the chat

**Engineering**
- Session-cookie auth with scrypt-hashed passwords and student/educator role-based access control
- Idempotent doubt creation (client-generated token; retries never duplicate)
- Image attachments with type/size validation and per-resource access checks
- Relational schema with foreign keys, indexes and a migration runner
- API test suite (node:test + supertest) against a real database

## Quick start

Requires Node.js 20+ and PostgreSQL 14+ (or Docker for the database).

```bash
# 1. Start PostgreSQL (Docker) or point DATABASE_URL at any Postgres
docker compose up -d db

# 2. Install dependencies
npm run install:all

# 3. Create the schema and load demo data
npm run migrate
npm run seed

# 4. Build the frontend and run the app
npm run build
npm start          # http://localhost:4000
```

For development with hot reload instead:

```bash
npm run dev        # server on :4000, Vite dev server on :5173 (proxied)
```

## Demo accounts (from `npm run seed`)

| Role     | Email                    | Password     |
| -------- | ------------------------ | ------------ |
| Educator | educator@doubtdesk.demo  | educator123  |
| Student  | aarav@doubtdesk.demo     | student123   |
| Student  | sara@doubtdesk.demo      | student123   |
| Student  | rohan@doubtdesk.demo     | student123   |

## Tests

```bash
npm test
```

Runs the API suite (13 tests) against a separate `doubt_portal_test` database (created from the same migrations; set `DATABASE_URL` to override).

## E2E smoke test

`scripts/e2e-smoke.py` drives a real browser through the whole loop (student submits a doubt with an image, educator searches/answers/sets status, student reads the answer) with assertions at each step. Requires Python + Playwright and a seeded app on :4000:

```bash
python3 scripts/e2e-smoke.py
```

## Demo video

`demo/demo.mp4` walks the full loop end to end: student login, asking a doubt with a screenshot, educator inbox triage (filters, search), answering, status changes, and the student reading the answer on a phone-width view. It is a silent screen recording at a deliberate pace - no voiceover.

## Configuration

| Variable           | Default                                            | Purpose                    |
| ------------------ | -------------------------------------------------- | -------------------------- |
| `PORT`             | `4000`                                             | API/app port               |
| `DATABASE_URL`     | `postgres://portal:portal@localhost:5432/doubt_portal` | PostgreSQL connection  |
| `SESSION_TTL_HOURS`| `72`                                               | Session lifetime           |
| `MAX_UPLOAD_BYTES` | `5242880`                                          | Image upload cap (5 MB)    |
| `UPLOAD_DIR`       | `server/uploads`                                   | Attachment storage         |
| `TELEGRAM_BOT_TOKEN` | _(unset)_                                        | Enables the Telegram bridge when set |
| `TELEGRAM_STUDENT_EMAIL` | _(first student)_                            | Student identity for Telegram-origin doubts |
| `TELEGRAM_DEFAULT_COURSE` | _(first course)_                            | Course code for Telegram-origin doubts |

## Documentation

- `docs/API.md` - REST API reference (+ `docs/openapi.yaml`)
- `docs/SCHEMA.md` - database schema and ER diagram
- `docs/ASSUMPTIONS.md` - assumptions, trade-offs and known limitations
