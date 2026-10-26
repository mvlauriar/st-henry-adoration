-- St. Henry Adoration — volunteer roster + open-hour sign-ups (2026-10-26)
-- Idempotent. Paste into Supabase → SQL Editor → Run. Only CREATEs new objects; touches no existing table.
-- volunteers = durable roster (who to contact later); hour_signups = commitments to specific open hours.
-- RLS on with NO anon/authenticated policies: only the server (service_role) can read/write.

create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  contact text not null,               -- normalized phone digits or lowercased email
  contact_type text not null check (contact_type in ('phone', 'email')),
  language text not null default 'en' check (language in ('en', 'es')),
  wants_alerts boolean not null default false,   -- opt-in: contact me when an hour needs someone
  wants_regular boolean not null default false,  -- interested in a regular weekly hour
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_type, contact)
);

create table if not exists hour_signups (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references volunteers(id) on delete cascade,
  campaign text not null,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  created_at timestamptz not null default now(),
  unique (volunteer_id, slot_start)
);
-- One person per hour: the database rejects a second sign-up for the same hour (safe under simultaneous submits).
create unique index if not exists hour_signups_one_per_hour on hour_signups (slot_start);
create index if not exists hour_signups_campaign_idx on hour_signups (campaign);

alter table volunteers   enable row level security;
alter table hour_signups enable row level security;
revoke all on volunteers   from anon, authenticated;
revoke all on hour_signups from anon, authenticated;
