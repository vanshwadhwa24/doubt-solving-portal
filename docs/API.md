# API reference

Base URL: `/api`. Auth is a session cookie (`dd_session`, httpOnly) issued by login. All errors are JSON: `{ "error": "message" }` with a fitting status code (400 validation, 401 unauthenticated, 403 wrong role/owner, 404 missing).

## Auth

| Method | Path           | Role | Description |
| ------ | -------------- | ---- | ----------- |
| POST   | `/auth/login`  | any  | Body `{email, password}`. Sets the session cookie, returns the user. |
| POST   | `/auth/logout` | any  | Ends the session. |
| GET    | `/auth/me`     | any  | Current user `{id, name, email, role}`. |

## Courses

| Method | Path       | Role | Description |
| ------ | ---------- | ---- | ----------- |
| GET    | `/courses` | any  | List all courses `{courses: [{id, code, name}]}`. |

## Doubts

| Method | Path                | Role     | Description |
| ------ | ------------------- | -------- | ----------- |
| POST   | `/doubts`           | student  | Multipart form: `course_id`, `description` (required), `title`, `client_token`, `image` (optional). Creates the doubt (201). A repeated `client_token` returns the original with `deduplicated: true` (200). |
| GET    | `/doubts`           | any      | Students: their own doubts. Educators: all doubts; query filters `course_id`, `status` (`open\|in_progress\|answered\|resolved`), `q` (searches question, replies, student name), `needs_reply=1` (only doubts whose last message is not the educator's, i.e. the educator owes a reply). Each row also carries `needs_educator`, `needs_student`, `waiting_since`, `last_sender_role`, `last_message_at`. |
| GET    | `/doubts/summary`   | educator | Counts `{open, in_progress, answered, resolved, unanswered}`. |
| GET    | `/doubts/:id`       | owner/educator | `{doubt, messages, attachments}` - full conversation. |
| POST   | `/doubts/:id/messages` | owner/educator | Multipart: `body`, optional `image`. Adds a reply. Educator replies mark the doubt `answered`; a student follow-up on `answered`/`resolved` reopens it to `in_progress`. |
| GET    | `/doubts/:id/similar` | educator | Up to 3 earlier answered doubts in the same course that share search terms with this one: `{similar:[{id,title,status,answered_at,answer,scrubbed,answer_has_image,matched}]}`. Never includes student name or email; those are replaced by `[student]` / `[email]` inside `title` and `answer`. 403 for students, 404 unknown doubt. |
| PATCH  | `/doubts/:id/messages/status` | any (own) | Body `{status}`. Educators: any status, except `answered` returns 409 unless the educator sent the last message. Students: only `resolved`, only on their own doubt (403 otherwise). |

## Attachments

| Method | Path                    | Role           | Description |
| ------ | ----------------------- | -------------- | ----------- |
| GET    | `/attachments/:id/file` | owner/educator | Streams the uploaded image with its stored MIME type. |

## Conventions

- IDs are bigints and serialize as strings in JSON.
- Timestamps are ISO-8601 with timezone.
- Images: PNG/JPEG/WebP/GIF, max 5 MB.
