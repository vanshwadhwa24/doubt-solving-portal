# Assumptions, trade-offs and known limitations

## Assumptions

- **Accounts are provisioned, not self-registered.** The brief describes two known roles inside an institution, so the seed creates the educator and students. A signup flow was deliberately left out of MVP scope.
- **A doubt's title is optional.** If the student does not supply one, it is derived from the first 80 characters of the question.
- **Statuses form a loose lifecycle, not a strict state machine.** Educators can move a doubt to any of Open / In Progress / Answered / Resolved at any time; replies nudge the status automatically (educator reply -> Answered, student follow-up on Answered/Resolved -> In Progress).
- **Sessions expire after 72 hours** and stay server-side, so logout actually invalidates them.

## Trade-offs

- **Attachments on local disk, not object storage.** Simplest thing that works locally and in a container; the access check still goes through the API. Production would move this to S3-style storage behind the same endpoint.
- **Polling instead of websockets.** The educator inbox refreshes every 15 s; for an MVP this is simpler and robust. Live push (SSE/websockets) is the natural upgrade.
- **ILIKE search.** Good enough at MVP scale; Postgres full-text search (`tsvector`) would be the next step for large inboxes.
- **Hash-based client routing** so the Express static server needs no SPA rewrite rules.

## Telegram bridge (bonus)

- Opt-in: no token, no bot - the core app never touches the network.
- **MVP mapping:** incoming Telegram messages are posted under one configured student identity and one default course. A real deployment would bind Telegram accounts to student accounts (a link code flow).
- Text-only intake; photo messages are ignored. Educator answers are pushed back as text.
- Updates are deduplicated in `telegram_updates` so a bot restart never double-posts a doubt.

## Known limitations

- No rate limiting or CAPTCHA on login (would be required before a public deployment).
- No email/notification delivery - students see answers when they open the app (or via the optional Telegram bot).
- Uploads are single-image per submission/reply.
- Deleting or editing doubts/messages is not supported in the MVP.
