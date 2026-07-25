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

-- ───────────────────────────────────────────────────────────────────────────
-- Annotation quota (server-authoritative per-user / per-domain cap).
-- ONE COUNTER ROW per (clerk_user_id, domain) — not an event ledger. The cap
-- NUMBER comes from the Kelviq entitlement (resolved server-side by the
-- annotation-quota Edge Function); this table holds only the COUNT + the reset
-- clock, keyed to the Clerk user id verified server-side. So the count survives
-- a localStorage clear / incognito profile and can't be reset from devtools —
-- which the old client-side ledger couldn't guarantee.
--
-- Reset model = FIXED 24h FROM EXHAUSTION: `exhausted_at` is stamped the moment
-- `used` reaches the cap; 24h later the WHOLE counter resets to 0 (lazily, on
-- the next reserve/status call). Before the cap is hit there is no countdown.
--
-- Rows are written ONLY by the Edge Function (service role) through the two
-- SECURITY DEFINER functions below; RLS is on with NO anon policies (same
-- lockdown as `subscriptions`).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.annotation_quota (
  clerk_user_id text        not null,
  domain        text        not null,
  used          integer     not null default 0,
  exhausted_at  timestamptz,                       -- set when `used` hits the cap; null otherwise
  updated_at    timestamptz not null default now(),
  primary key (clerk_user_id, domain)
);

alter table public.annotation_quota enable row level security;

-- Atomically reserve one annotation slot. p_cap = -1 means unlimited (Max).
-- Returns the post-reserve count, ms until the WHOLE quota resets (non-null only
-- once exhausted), and whether the reservation was allowed. The `for update`
-- row lock serialises concurrent reserves so the count can't be raced past the
-- cap. Applies the lazy 24h-from-exhaustion reset before deciding.
create or replace function public.reserve_annotation(
  p_user text,
  p_domain text,
  p_cap integer
)
returns table (used integer, resets_in_ms bigint, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used         integer;
  v_exhausted_at timestamptz;
  window_ms constant bigint := 24 * 60 * 60 * 1000;
begin
  -- Ensure the row exists, then lock it for the read-modify-write.
  insert into public.annotation_quota (clerk_user_id, domain)
    values (p_user, p_domain)
    on conflict (clerk_user_id, domain) do nothing;

  select aq.used, aq.exhausted_at
    into v_used, v_exhausted_at
    from public.annotation_quota aq
    where aq.clerk_user_id = p_user and aq.domain = p_domain
    for update;

  -- Lazy reset: 24h after exhaustion the whole quota returns.
  if v_exhausted_at is not null and now() - v_exhausted_at >= interval '24 hours' then
    v_used := 0;
    v_exhausted_at := null;
  end if;

  -- Unlimited: always allow, never track a reset clock.
  if p_cap < 0 then
    v_used := v_used + 1;
    update public.annotation_quota
      set used = v_used, exhausted_at = null, updated_at = now()
      where clerk_user_id = p_user and domain = p_domain;
    return query select v_used, null::bigint, true;
    return;
  end if;

  -- At/over the cap: deny; report the time left on the reset clock.
  if v_used >= p_cap then
    update public.annotation_quota
      set used = v_used, exhausted_at = v_exhausted_at, updated_at = now()
      where clerk_user_id = p_user and domain = p_domain;
    return query select
      v_used,
      greatest(0, window_ms - (extract(epoch from (now() - v_exhausted_at)) * 1000))::bigint,
      false;
    return;
  end if;

  -- Allow: consume a slot; stamp exhaustion if this one hit the cap.
  v_used := v_used + 1;
  if v_used >= p_cap then
    v_exhausted_at := now();
  end if;
  update public.annotation_quota
    set used = v_used, exhausted_at = v_exhausted_at, updated_at = now()
    where clerk_user_id = p_user and domain = p_domain;
  return query select
    v_used,
    case when v_exhausted_at is not null
      then greatest(0, window_ms - (extract(epoch from (now() - v_exhausted_at)) * 1000))::bigint
      else null::bigint end,
    true;
end;
$$;

-- Read-only status (+ lazy reset). Doesn't need the cap — the reset depends only
-- on exhausted_at. Persists the reset so `used` stays truthful for the UI.
create or replace function public.get_annotation_quota(
  p_user text,
  p_domain text
)
returns table (used integer, resets_in_ms bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used         integer;
  v_exhausted_at timestamptz;
  window_ms constant bigint := 24 * 60 * 60 * 1000;
begin
  select aq.used, aq.exhausted_at
    into v_used, v_exhausted_at
    from public.annotation_quota aq
    where aq.clerk_user_id = p_user and aq.domain = p_domain
    for update;

  if not found then
    return query select 0, null::bigint;
    return;
  end if;

  if v_exhausted_at is not null and now() - v_exhausted_at >= interval '24 hours' then
    v_used := 0;
    v_exhausted_at := null;
    update public.annotation_quota
      set used = 0, exhausted_at = null, updated_at = now()
      where clerk_user_id = p_user and domain = p_domain;
  end if;

  return query select
    v_used,
    case when v_exhausted_at is not null
      then greatest(0, window_ms - (extract(epoch from (now() - v_exhausted_at)) * 1000))::bigint
      else null::bigint end;
end;
$$;

-- Hygiene sweep (cleanup only — reset is computed on access): drop rows that
-- have fully reset (used = 0) and haven't been touched in a week.
create or replace function public.delete_idle_annotation_quota()
returns void
language sql
as $$
  delete from public.annotation_quota
    where used = 0 and updated_at < now() - interval '7 days';
$$;

select cron.unschedule('sweep-annotation-quota')
  where exists (select 1 from cron.job where jobname = 'sweep-annotation-quota');

select cron.schedule(
  'sweep-annotation-quota',
  '15 3 * * *',
  $$select public.delete_idle_annotation_quota()$$
);

-- ── Auth follow-up (swap in once registered users exist) ─────────────────────
-- Add an `author_id uuid references auth.users` column, then replace the open
-- policies above with owner-scoped ones, e.g.:
--
--   create policy "owner writes" on public.annotations for all
--     using (auth.uid() = author_id) with check (auth.uid() = author_id);
--   create policy "team reads"  on public.annotations for select
--     using (auth.role() = 'authenticated');
