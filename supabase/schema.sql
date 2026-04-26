-- St. Henry Adoration — database setup
-- Paste this entire file into Supabase: SQL Editor → New Query → Run

create table if not exists signups (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  slot_hour int not null check (slot_hour >= 8 and slot_hour <= 19),
  name text not null,
  phone text,
  email text,
  recurring boolean default false,
  recurring_group_id uuid,
  reminder_sent boolean default false,
  created_at timestamptz default now()
);

-- Speed up the common queries
create index if not exists signups_slot_idx on signups (slot_date, slot_hour);
create index if not exists signups_recurring_idx on signups (recurring_group_id) where recurring_group_id is not null;
create index if not exists signups_reminder_idx on signups (slot_date, slot_hour, reminder_sent) where reminder_sent = false;

-- Row Level Security: anyone can read the slot counts and add a signup,
-- but the service role key (admin only, server-side) is required to delete or read PII.
alter table signups enable row level security;

-- Public can insert (sign up)
create policy "anyone can sign up"
  on signups for insert
  to anon
  with check (true);

-- Public can read only the columns needed for the grid (we'll use a view)
-- Drop and recreate to be safe
drop view if exists slot_counts;
create view slot_counts as
  select slot_date, slot_hour, count(*)::int as filled
  from signups
  group by slot_date, slot_hour;

grant select on slot_counts to anon;
