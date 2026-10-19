-- St. Henry Adoration — Kiosk V2 migration (2026-10-19)
-- Idempotent: safe to run more than once. Paste into Supabase → SQL Editor → Run.
--
-- ASSUMPTIONS about the live schema (not verified against the live DB):
--  * `signups` exists (supabase/schema.sql) and the live DB already has the columns the
--    V1 code uses: checked_in_at, checked_out_at, no_show, walk_in, recurring_paused.
--    They are added below with IF NOT EXISTS in case any are missing.
--  * `coordinators` and `alerts_sent` already exist (used by admin + cron). Created only if
--    missing; existing rows (backup/substitute contacts) are never touched or deleted.
--  * Server code uses the service_role key, which bypasses RLS. The anon key is only used
--    by the public sign-up page to read `slot_counts`.

-- 1) Attendance columns on the existing signups table (reused as attendance records)
alter table signups add column if not exists checked_in_at   timestamptz;
alter table signups add column if not exists checked_out_at  timestamptz;
alter table signups add column if not exists walk_in         boolean not null default false;
alter table signups add column if not exists no_show         boolean not null default false;
alter table signups add column if not exists recurring_paused boolean not null default false;

create index if not exists signups_active_idx on signups (checked_in_at) where checked_in_at is not null and checked_out_at is null;

-- Guard against two simultaneous active check-ins for the same verified (phone) volunteer.
-- Wrapped so a pre-existing duplicate in live data cannot make the migration fail.
do $$ begin
  create unique index if not exists signups_one_active_per_phone
    on signups ((regexp_replace(phone, '\D', '', 'g')))
    where phone is not null and checked_in_at is not null and checked_out_at is null;
exception when others then
  raise notice 'signups_one_active_per_phone not created (existing duplicates?): %', sqlerrm;
end $$;

-- 2) Existing support tables (create only if missing; never altered destructively)
create table if not exists coordinators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  active boolean default true,
  created_at timestamptz default now()
);
create table if not exists alerts_sent (
  id uuid primary key default gen_random_uuid(),
  alert_key text unique not null,
  created_at timestamptz default now()
);

-- 3) NEW: kiosk "New here?" lead capture
create table if not exists volunteer_inquiries (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  consent boolean not null default false,
  status text not null default 'new' check (status in ('new', 'contacted', 'resolved')),
  status_updated_at timestamptz,
  source text default 'kiosk',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists volunteer_inquiries_created_idx on volunteer_inquiries (created_at desc);

-- 4) NEW: audit trail for check-ins, check-outs and manual corrections
create table if not exists attendance_audit (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid references signups(id) on delete set null,
  action text not null,          -- checkin | checkout | correction | admin_checkin | ...
  source text not null,          -- kiosk | admin
  old_value text,
  new_value text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists attendance_audit_created_idx on attendance_audit (created_at desc);
create index if not exists attendance_audit_signup_idx on attendance_audit (signup_id);

-- 5) Row-level security: contact info readable only by the service role.
--    RLS on with NO anon/authenticated policies = no access except service_role.
alter table signups             enable row level security;
alter table coordinators        enable row level security;
alter table alerts_sent         enable row level security;
alter table volunteer_inquiries enable row level security;
alter table attendance_audit    enable row level security;
revoke all on volunteer_inquiries from anon, authenticated;
revoke all on attendance_audit    from anon, authenticated;
revoke all on coordinators        from anon, authenticated;
revoke all on alerts_sent         from anon, authenticated;
-- signups keeps its existing "anyone can sign up" INSERT policy; anon has no SELECT policy.

-- 6) Public slot counts: walk-in attendance rows must not use up scheduled sign-up spots.
create or replace view slot_counts as
  select slot_date, slot_hour, count(*)::int as filled
  from signups
  where not coalesce(walk_in, false)
  group by slot_date, slot_hour;
grant select on slot_counts to anon;
