-- ───────────────────────────────────────────────────────────────────────────
-- Annotate realtime collaboration schema.
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- Mirrors the `Annotation` TypeScript type (src/lib/types.ts) in snake_case.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.annotations (
  id                uuid primary key,                  -- client-generated (crypto.randomUUID)
  page_url          text        not null,
  selector          jsonb,
  comment           text        not null default '',
  category          text        not null default 'General',
  status            text        not null default 'Open',
  author            text        not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  styling           jsonb       not null default '{}'::jsonb,
  suggested_changes jsonb       not null default '{}'::jsonb,
  replies           jsonb       not null default '[]'::jsonb
);

-- Collaboration rooms are scoped per page URL; index for the hydrate query.
create index if not exists annotations_page_url_idx on public.annotations (page_url);

-- ───────────────────────────────────────────────────────────────────────────
-- Live collaboration sessions.
-- A session is a unique, shareable room. Only the author/admin starts one;
-- the id travels in the share link (?session=<id>). The channel name is
-- `annot:<session id>`, so live collab is only possible with the link.
-- Annotations stay page-scoped (above) and persist across sessions.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id         uuid        primary key,          -- client-generated (crypto.randomUUID)
  page_url   text        not null,
  active     boolean     not null default true,
  created_by text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A share link lives for 3 days, then it's hard-deleted (see the sweep below).
  -- Annotations are page-scoped (separate table) and untouched by that delete.
  expires_at timestamptz not null default (now() + interval '3 days')
);

-- Backfill the column for tables created before expiry existed.
alter table public.sessions
  add column if not exists expires_at timestamptz not null default (now() + interval '3 days');

-- Index the sweep predicate (delete where expires_at < now()).
create index if not exists sessions_expires_at_idx on public.sessions (expires_at);

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Stream INSERT/UPDATE/DELETE to subscribed clients (Postgres Changes).
alter publication supabase_realtime add table public.annotations;
-- Sessions stream too, so joiners are kicked when a session is invalidated.
alter publication supabase_realtime add table public.sessions;

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.annotations enable row level security;
alter table public.sessions    enable row level security;

-- NOTE: No auth yet — identity is the "Your name" field. These policies allow
-- the anon key full access so the prototype works. They are intentionally open.
drop policy if exists "anon read annotations"   on public.annotations;
drop policy if exists "anon insert annotations" on public.annotations;
drop policy if exists "anon update annotations" on public.annotations;
drop policy if exists "anon delete annotations" on public.annotations;

create policy "anon read annotations"
  on public.annotations for select
  using (true);

create policy "anon insert annotations"
  on public.annotations for insert
  with check (true);

create policy "anon update annotations"
  on public.annotations for update
  using (true) with check (true);

create policy "anon delete annotations"
  on public.annotations for delete
  using (true);

-- Sessions: open anon access for the prototype (mirror annotations). Delete is
-- allowed so an expired link can be swept from the client too (the host clears
-- its own dead session on join); the scheduled job below is the primary sweep.
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

-- ── Expired-session sweep (backend cleanup) ─────────────────────────────────
-- Hard-delete sessions once they pass their 3-day expires_at. This runs on the
-- backend independent of any client, so links are cleaned up even if no host
-- ever revisits them. IMPORTANT: only the `sessions` table is touched —
-- annotations are page-scoped in their own table and are never deleted here.
create extension if not exists pg_cron;

create or replace function public.delete_expired_sessions()
returns void
language sql
as $$
  delete from public.sessions where expires_at <= now();
$$;

-- Run hourly. Unschedule first so re-running this file doesn't stack duplicates.
select cron.unschedule('sweep-expired-sessions')
  where exists (select 1 from cron.job where jobname = 'sweep-expired-sessions');

select cron.schedule(
  'sweep-expired-sessions',
  '0 * * * *',
  $$select public.delete_expired_sessions()$$
);

-- ───────────────────────────────────────────────────────────────────────────
-- Subscriptions (Kelviq recurring billing) — mirror table.
-- The source of truth is Kelviq; this table is a server-written audit trail +
-- the ownership check for the kelviq-subscription function. Rows are written
-- ONLY by the Edge Functions (service role), so RLS denies the anon key
-- entirely (no permissive policies) — unlike the open prototype tables above.
-- The web app never reads this table (it reads live Kelviq entitlements).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  kelviq_subscription_id text        primary key,   -- Kelviq subscription id
  clerk_user_id          text        not null,       -- = Kelviq customerId
  kelviq_customer_id      text        not null default '',
  plan                   text        not null default 'free',   -- free | pro | max
  billing_cycle          text,                                   -- monthly | yearly | null
  status                 text        not null default 'active',
  renews_at              timestamptz,
  ends_at                timestamptz,                            -- set when cancelling
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_user_idx
  on public.subscriptions (clerk_user_id);

-- RLS on, with NO anon policies: the anon key can't read/write; the Edge
-- Functions use the service role (which bypasses RLS).
alter table public.subscriptions enable row level security;

-- ── Auth follow-up (swap in once registered users exist) ─────────────────────
-- Add an `author_id uuid references auth.users` column, then replace the open
-- policies above with owner-scoped ones, e.g.:
--
--   create policy "owner writes" on public.annotations for all
--     using (auth.uid() = author_id) with check (auth.uid() = author_id);
--   create policy "team reads"  on public.annotations for select
--     using (auth.role() = 'authenticated');
