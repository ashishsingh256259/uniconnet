# UniConnect

Student–teacher academic communication workspace with a static HTML/CSS/JavaScript frontend and Supabase Auth + PostgreSQL backend.

## Run

Serve the repository root using a static HTTP server (for example, `python -m http.server 8000`) and open http://localhost:8000. The deployed static site loads `live.js`. The configured Supabase URL and **publishable** key are public client configuration, not administrator credentials.

Create a student account, confirm the email if required by Supabase, then sign in. Student accounts cannot promote themselves. A trusted project administrator must verify faculty identity and update the corresponding `profiles.role` in the Supabase dashboard. For a different Supabase project, apply the SQL migrations in order and replace API and PUBLIC_KEY in live.js; use a publishable key only.

## Features and verification

- Email/password auth, profile roles, anonymous doubts, replies and upvotes.
- Faculty notices and polls; one vote per user per poll.
- Participant-only direct messages; DM refresh every 15 seconds when the page is visible.
- Faculty resource links, authenticated dashboard counts, manual refresh.
- Row-level access policies and private anonymous author lookup.
- Run `node --test tests/*.test.cjs` for static and JavaScript regression tests. SQL permission checks were exercised on the configured database in a rolled-back transaction.

## Known limitations

- Sign in again after page reload (tokens remain in memory, not local storage).
- Registration is not restricted to verified college domains; faculty roles require manual approval.
- Message delivery is polling-based, not WebSocket-based; notice read state is not persisted.
- The generative AI provider is not configured. The frontend does not call a model provider or expose an API secret.
- Full live email-delivery, browser workflow and multi-user acceptance tests must be completed before production use.

