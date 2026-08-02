-- ───────────────────────────────────────────────────────────────────────────
-- Verification for 001_share_link_plan_expiry.sql — proves the expiry CEILING
-- actually holds. Run in the Supabase SQL editor AFTER the migration.
--
-- Worth running by hand because the ceiling is the one part of the feature the app
-- cannot demonstrate: from the browser you only observe the value you were given,
-- never that a forged one would have been rejected. Here we impersonate the anon
-- role and try to cheat.
--
-- Everything runs in a transaction that ROLLS BACK, so no rows survive. Results
-- print as PASS / *** FAIL *** rows at the end.
-- ───────────────────────────────────────────────────────────────────────────

begin;

-- ── As anon (what the browser is): every attempt to exceed Free must clamp ───
set local role anon;

-- Forge "never expires" (what a Max link legitimately gets).
insert into public.sessions (id, page_url, created_by, expires_at)
values ('11111111-1111-1111-1111-111111111111', 'https://example.test/a', 'attacker', null);

-- Forge a 30-day link (what Pro legitimately gets).
insert into public.sessions (id, page_url, created_by, expires_at)
values ('22222222-2222-2222-2222-222222222222', 'https://example.test/b', 'attacker',
        now() + interval '30 days');

-- Forge a 10-year link.
insert into public.sessions (id, page_url, created_by, expires_at)
values ('33333333-3333-3333-3333-333333333333', 'https://example.test/c', 'attacker',
        now() + interval '10 years');

-- Send nothing and take the column default.
insert into public.sessions (id, page_url, created_by)
values ('44444444-4444-4444-4444-444444444444', 'https://example.test/d', 'attacker');

-- Try to EXTEND an existing link (the devtools attack on an already-minted link).
update public.sessions set expires_at = now() + interval '90 days'
 where id = '11111111-1111-1111-1111-111111111111';

-- Try to make an existing link never expire.
update public.sessions set expires_at = null
 where id = '22222222-2222-2222-2222-222222222222';

-- A normal active-flag write (what deactivateSession does on every tab close)
-- must still succeed and must leave expires_at alone.
update public.sessions set active = false
 where id = '44444444-4444-4444-4444-444444444444';

reset role;

-- ── As a trusted role: the Edge Function's stamps must NOT be clamped ───────
-- session-create uses the service-role key; the SQL editor is `postgres`, which
-- the trigger whitelists identically.
insert into public.sessions (id, page_url, created_by, expires_at)
values ('55555555-5555-5555-5555-555555555555', 'https://example.test/pro', 'server',
        now() + interval '30 days');

insert into public.sessions (id, page_url, created_by, expires_at)
values ('66666666-6666-6666-6666-666666666666', 'https://example.test/max', 'server', null);

-- ── Report ─────────────────────────────────────────────────────────────────
-- 24h plus a minute of slack absorbs clock skew and execution time.
with checks as (
  select 'anon: forged NULL ("never") clamped to 24h' as label,
         (select expires_at is not null
                 and expires_at <= now() + interval '24 hours 1 minute'
            from public.sessions where id = '11111111-1111-1111-1111-111111111111') as ok
  union all
  select 'anon: forged 30-day insert clamped to 24h',
         (select expires_at <= now() + interval '24 hours 1 minute'
            from public.sessions where id = '22222222-2222-2222-2222-222222222222')
  union all
  select 'anon: forged 10-year insert clamped to 24h',
         (select expires_at <= now() + interval '24 hours 1 minute'
            from public.sessions where id = '33333333-3333-3333-3333-333333333333')
  union all
  select 'anon: column default lands at 24h',
         (select expires_at <= now() + interval '24 hours 1 minute'
            from public.sessions where id = '44444444-4444-4444-4444-444444444444')
  union all
  -- The UPDATE at the top tried to push this to +90 days; the pin must have won.
  select 'anon: cannot EXTEND an existing expiry',
         (select expires_at <= now() + interval '24 hours 1 minute'
            from public.sessions where id = '11111111-1111-1111-1111-111111111111')
  union all
  -- The UPDATE tried to set NULL; the pin must have kept the original timestamp.
  select 'anon: cannot NULL an existing expiry',
         (select expires_at is not null
            from public.sessions where id = '22222222-2222-2222-2222-222222222222')
  union all
  select 'anon: active flag writable, expiry undisturbed',
         (select active = false
                 and expires_at is not null
                 and expires_at <= now() + interval '24 hours 1 minute'
            from public.sessions where id = '44444444-4444-4444-4444-444444444444')
  union all
  select 'trusted role: can stamp Pro 30 days',
         (select expires_at > now() + interval '29 days'
            from public.sessions where id = '55555555-5555-5555-5555-555555555555')
  union all
  select 'trusted role: can stamp Max never (NULL)',
         (select expires_at is null
            from public.sessions where id = '66666666-6666-6666-6666-666666666666')
)
select case when ok then 'PASS' else '*** FAIL ***' end as result, label
from checks
order by ok nulls first, label;

-- ── anon DELETE must actually remove a row (the policy that goes missing) ────
set local role anon;
with gone as (
  delete from public.sessions
   where id = '33333333-3333-3333-3333-333333333333'
  returning id
)
select case when count(*) = 1 then 'PASS' else '*** FAIL ***' end as result,
       'anon: delete actually removes the row' as label
from gone;
reset role;

-- ── The sweep must delete overdue links and SPARE never-expiring ones ───────
update public.sessions set expires_at = now() - interval '1 minute'
 where id = '55555555-5555-5555-5555-555555555555';

select public.delete_expired_sessions();

select case
         when not exists (select 1 from public.sessions
                           where id = '55555555-5555-5555-5555-555555555555')
          and exists (select 1 from public.sessions
                       where id = '66666666-6666-6666-6666-666666666666')
         then 'PASS' else '*** FAIL ***' end as result,
       'sweep deletes overdue links and spares never-expiring ones' as label;

-- Nothing above is kept.
rollback;
 