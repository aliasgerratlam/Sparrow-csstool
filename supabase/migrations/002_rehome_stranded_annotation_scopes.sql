-- ─────────────────────────────────────────────────────────────────────────
-- One-off repair: re-home annotations stranded under a stale page identity.
--
-- `page_url` is the scope everything agrees on — the hydrate query, the
-- realtime `page_url=eq.<scope>` filter, and every write. It is supposed to be
-- canonicalPageUrl(): origin + path + the query params that identify the page,
-- with the session param stripped.
--
-- A shipped browser-extension build derived it wrongly. In its content script
-- the `URL`-based strip in canonicalPageUrl() did not take, and the fallback of
-- the day returned the raw href — so that client's page identity kept the
-- `?sparrow-session=<id>` it had joined with. Nothing errored. It hydrated,
-- filtered realtime, and inserted under a scope no other participant queries,
-- so each side saw only its own pins while live cursors (keyed on the session
-- id, not page_url) kept working normally.
--
-- The client fix is in src/lib/session.ts (query filtering is pure string work
-- now, and canonicalizeUrl re-checks its own output). This statement repairs the
-- rows already written the wrong way, which no client can find to fix.
--
-- Safe to re-run: the WHERE clause only matches rows that still carry a session
-- param, and the rewrite is idempotent. `id` is the primary key and is not
-- touched, so re-homing can never collide with an existing row.
-- ─────────────────────────────────────────────────────────────────────────

update public.annotations
set page_url = regexp_replace(
                 regexp_replace(
                   regexp_replace(
                     -- 1. drop any fragment (never part of the identity)
                     -- 2. drop the session params wherever they sit, keeping the
                     --    separator that introduced them
                     regexp_replace(
                       split_part(page_url, '#', 1),
                       '([?&])(sparrow-session|session)=[^&]*', '\1', 'gi'
                     ),
                     -- 3. collapse the separators the removal left behind
                     '\?&+', '?', 'g'
                   ),
                   '&&+', '&', 'g'
                 ),
                 -- 4. trim a now-empty query string
                 '[?&]+$', '', 'g'
               )
where page_url ~* '[?&](sparrow-session|session)=';
