-- ───────────────────────────────────────────────────────────────────────────
-- Migration: plan-based share-link expiry (Free 24h / Pro 30d / Max never).
--
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL → New query → paste →
-- Run) BEFORE deploying the session-create Edge Function and the app.
--
-- Why this file exists instead of "just re-run schema.sql": schema.sql is the full
-- bootstrap and the SQL editor runs a script as a single transaction, so one
-- already-applied statement aborts and rolls back the entire run. This file is
-- narrowly scoped to what the feature changes and is safe to run repeatedly.
--
-- Every statement is idempotent. Nothing here rewrites existing rows: share links
-- already carrying a 3-day expiry simply ride out their remaining lifetime.
-- Annotations are in a separate, page-scoped table and are never touched.
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. expires_at becomes nullable, defaulting to the Free duration ──────────
-- NULL is how "never expires" (Max) is stored, so the NOT NULL constraint from
-- the original schema must go — otherwise every Max insert fails with 23502 and
-- the Edge Function 502s.
alter table public.sessions
  add column if not exists expires_at timestamptz;

alter table public.sessions
  alter column expires_at drop not null;

alter table public.sessions
  alter column expires_at set default (now() + interval '24 hours');

-- Index the sweep predicate (delete where expires_at <= now()).
create index if not exists sessions_expires_at_idx
  on public.sessions (expires_at);

-- ── 2. The expiry ceiling (this is the security boundary) ────────────────────
-- Sessions RLS is intentionally open to the anon key, so the browser chooses its
-- own expires_at — without this trigger a Free user could mint a never-expiring
-- link straight from devtools. The trigger caps every UNTRUSTED insert at the Free
-- duration, which is what makes the session-create Edge Function an *elevator* to
-- 30d/never rather than a gate (and what makes the client's fall back to a direct
-- insert safe: it can only ever land on Free's 24h).
--
-- Trust is keyed on current_user, the Postgres role PostgREST sets via
-- `SET LOCAL ROLE` from the API key: anon key -> anon, service-role key ->
-- service_role, SQL editor -> postgres.
--   * Do NOT probe request.jwt.claim.role — PostgREST removed the singular GUCs,
--     so it reads NULL for every request on a current project.
--   * Do NOT treat "no JWT claims" as trusted — the newer sb_publishable_* keys
--     aren't JWTs, so that heuristic fails OPEN for ordinary browser traffic.
-- It's a whitelist, so an unrecognised role is untrusted.
-- SECURITY INVOKER (the default) is REQUIRED: security definer would rewrite
-- current_user to the function owner and make every caller look trusted.
create or replace function public.enforce_session_expiry()
returns trigger
language plpgsql
as $$
declare
  trusted boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
  cap timestamptz := now() + interval '24 hours';
begin
  if trusted then
    return new;                       -- may set any expiry, including NULL
  end if;

  if tg_op = 'INSERT' then
    -- least() IGNORES nulls, so a client-sent NULL ("never") collapses to the cap.
    new.expires_at := least(new.expires_at, cap);
  else
    -- PIN, never re-clamp. deactivateSession (host beforeunload) and
    -- reactivateSession both run with the ANON key, so clamping here would
    -- silently rewrite a Max link's NULL -> 24h on the first tab close. Pinning
    -- also makes already-deployed clients safe: an older build's renewing UPDATE
    -- is ignored rather than erroring.
    new.expires_at := old.expires_at;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_enforce_expiry on public.sessions;
create trigger sessions_enforce_expiry
  before insert or update on public.sessions
  for each row execute function public.enforce_session_expiry();

-- ── 3. Session RLS policies (re-asserted) ───────────────────────────────────
-- The DELETE policy is load-bearing and is the one most likely to be MISSING:
-- under RLS a delete that matches no permitted row still returns success with
-- zero rows, so without it every deleteSession() call silently does nothing and
-- the host's "Create a new link" leaves the previous link alive. Expiry itself is
-- unaffected either way (the sweep in step 4 runs as the job owner and bypasses
-- RLS). drop-then-create makes this safe to re-run.
alter table public.sessions enable row level security;

drop policy if exists "anon read sessions"   on public.sessions;
drop policy if exists "anon insert sessions" on public.sessions;
drop policy if exists "anon update sessions" on public.sessions;
drop policy if exists "anon delete sessions" on public.sessions;

create policy "anon read sessions"
  on public.sessions for select
  using (true);

create policy "anon insert sessions"
  on public.sessions for insert
  with check (true);

create policy "anon update sessions"
  on public.sessions for update
  using (true) with check (true);

create policy "anon delete sessions"
  on public.sessions for delete
  using (true);

-- ── 4. Expiry sweep, every 5 minutes ────────────────────────────────────────
-- Rows with a NULL expires_at never expire and are skipped by the predicate.
-- Cadence raised from hourly: an hour of grace was 1/72 of a 3-day link but is
-- 1/24 of a Free 24h one, and the client-side expiry check uses the CLIENT clock,
-- so a back-dated clock keeps a dead link usable for the whole grace window.
create extension if not exists pg_cron;

create or replace function public.delete_expired_sessions()
returns void
language sql
as $$
  delete from public.sessions where expires_at <= now();
$$;

select cron.unschedule('sweep-expired-sessions')
  where exists (select 1 from cron.job where jobname = 'sweep-expired-sessions');

select cron.schedule(
  'sweep-expired-sessions',
  '*/5 * * * *',
  $$select public.delete_expired_sessions()$$
);

-- ── 5. Realtime publication (guarded) ───────────────────────────────────────
-- `alter publication ... add table` ERRORS if the table is already published, and
-- this script is one transaction — so it must be guarded or a re-run rolls back
-- everything above.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end
$$;

commit;

-- ── Post-run verification ───────────────────────────────────────────────────
-- Expect: is_nullable = YES, default = (now() + '24:00:00'::interval)
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions' and column_name = 'expires_at';

-- Expect one row: sessions_enforce_expiry
select tgname from pg_trigger
where tgrelid = 'public.sessions'::regclass and not tgisinternal;

-- Expect four rows, including DELETE
select cmd, policyname from pg_policies
where schemaname = 'public' and tablename = 'sessions'
order by cmd;

-- Expect schedule = */5 * * * *
select jobname, schedule from cron.job where jobname = 'sweep-expired-sessions';
