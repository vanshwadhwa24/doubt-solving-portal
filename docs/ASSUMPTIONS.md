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

## Whose turn it is

- Turn is **derived from the last message**, not stored: educator last means the student's turn; otherwise (student last, or no replies) the educator's. Status follows: an educator reply sets Answered, a student follow-up sets In Progress (or keeps Open if never worked on).
- The API refuses `answered` unless the educator sent the last message (409), so status and turn cannot disagree.
- Migration `002_status_follows_turn.sql` repairs older rows that said Answered while the student had the last word. It changes status only; message history is untouched.
- Wait time is measured from the last student message (or the doubt's creation).

## Work queue and answer reuse

- **Queue** = doubts where the educator owes a reply, longest wait first, optionally within the current course/search filter. Send & next answers and opens the next one. Skip is remembered in the URL; when only skipped doubts remain the queue wraps back to them, so "Queue clear" is shown only when nothing needs a reply.
- **Measured effect** (fixed task: educator signed in, Needs reply loaded, answer every waiting doubt with a one-line answer; `scripts/measure-queue.py`, 3 doubts, clicks counted by a capture-phase listener, route changes by history pushes, run on seeded data): without the queue 9 clicks and 6 route changes; with the queue 4 clicks and 4 route changes. Per doubt that is 3 clicks and 2 route changes against 1 click and 1 route change (plus a fixed 1 click and 1 route change to start the queue and 1 route change to finish). Typing is identical in both (3 entries). This is a navigation measurement on a small seed, not a measurement of real educators or time saved.
- **Similar answers** use Postgres full-text stemming: the new doubt's distinctive words (no code, short words or common words, at most 14) are each tested against earlier doubts in the same course that already have an educator reply. A match needs at least 2 shared words and at least a quarter of the words. Hypothesis, not validated: relevance on real data is untested beyond the fixtures in `server/test/similar.test.js`, and the check runs over the course's doubts per request, so a real deployment needs a GIN index or precomputed vectors.
- **Privacy:** only educators can call it. The student's name and email never leave the server for a suggestion. Any occurrence of the original student's name or email inside the old title or answer is replaced with `[student]` / `[email]`. The client refuses to send while a placeholder is in the box. Details that are not names (numbers, references to the student's own code) are not detected, so the draft carries a warning to check them. Images in the old answer are not copied.
- Nothing is sent automatically. Other students' doubts are never shown to students.

## UI behaviour

- Student home lists active doubts only; resolved ones are at `#/resolved`. Students may resolve their own doubt; an educator can reopen.
- Thread refreshes every 10s and the student home every 20s by polling (no websockets); polling does not pause for hidden tabs.
- Code fences render as code blocks in threads and show as "[code]" in list excerpts.

## Known limitations

- Visual language (cream, black borders, hard shadows, lilac/lime) is adapted from a reference clip supplied by the product owner; system fonts only, no new dependencies.
- Telegram has not been tested against a real bot; phone testing used a 390px browser viewport, not a device. No accessibility audit or load test.

- No rate limiting or CAPTCHA on login (would be required before a public deployment).
- No email/notification delivery - students see answers when they open the app (or via the optional Telegram bot).
- Uploads are single-image per submission/reply.
- Deleting or editing doubts/messages is not supported in the MVP.
