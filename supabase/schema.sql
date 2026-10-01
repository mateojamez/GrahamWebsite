-- Full schema for the grahamwedding Supabase project.
-- Run this in the Supabase SQL editor by hand — it is not applied automatically,
-- there is no migration tooling wired up to this repo.
--
-- 3 tables. Event invitations live directly on `guests` as boolean columns
-- (there are only ever 3 fixed events, so a join table would be overkill).
-- Guests RSVP to the ring ceremony and reception only. `invited_temple` records
-- the temple list from the guest spreadsheet but has no RSVP rows.
-- `rsvps.event` is a plain text slug matching the event slugs in
-- js/wedding-config.js (WEDDING.events[].slug) rather than a foreign key.
--
-- The `guests`/`parties`/`rsvps` tables that already exist on this project don't
-- have any of the columns the site expects (checked via REST). Confirmed with
-- the site owner these are empty placeholders, so this script drops and
-- recreates all 3 tables from scratch. Do not run this against a project that
-- already has real guest data.

drop table if exists rsvps;
drop table if exists guests;
drop table if exists parties;

create table parties (
  id uuid primary key default gen_random_uuid(),
  party_name text not null
);

create table guests (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete cascade,
  first_name text not null,
  last_name text,
  invited_temple boolean not null default false,
  invited_ring_ceremony boolean not null default false,
  invited_reception boolean not null default false
);

-- One row per (guest, event) they've answered for.
create table rsvps (
  guest_id uuid not null references guests(id) on delete cascade,
  event text not null check (event in ('ring-ceremony', 'reception')),
  attending boolean not null default false,
  dietary_restrictions text not null default '',
  updated_at timestamptz not null default now(),
  primary key (guest_id, event)
);

-- RLS: the site has no login — guests read/write using only the publishable
-- key, so `anon` needs read on everything and write access on rsvps only.
alter table parties enable row level security;
alter table guests enable row level security;
alter table rsvps enable row level security;

create policy "anon can read parties" on parties for select to anon using (true);
create policy "anon can read guests" on guests for select to anon using (true);
create policy "anon can read rsvps" on rsvps for select to anon using (true);
create policy "anon can insert rsvps" on rsvps for insert to anon with check (true);
create policy "anon can update rsvps" on rsvps for update to anon using (true) with check (true);
