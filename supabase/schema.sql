-- Full schema for the wedding RSVP, on Supabase.
-- Run this in the Supabase SQL editor by hand; there is no migration tooling.
-- It drops and recreates every RSVP table, so running it again erases all
-- invitations and answers. Re-import the guest list afterward
-- (scripts/guests_to_sql.py).
--
-- Model
--   invitees     one invitation line, such as "Jared and Anita Mora and Family"
--   invitations  one row per (invitee, event) with the seats reserved
--   responses    one row per invitation once answered: `coming` people, 0 = No
--
-- Event slugs match RSVP_EVENTS in js/rsvp-model.js:
--   ring-ceremony, reception, open-house
-- The Temple Sealing takes no RSVP and has no rows here.
--
-- Access
--   RLS is on with no policies, and anon has no table privileges, so the
--   publishable key can't read or write tables directly. The site calls the
--   security definer functions at the end of this file instead.
--   rsvp_report() returns every invitation and answer to anyone with the
--   publishable key; that is what powers rsvpcheck/, which has no password.

create extension if not exists fuzzystrmatch with schema extensions;

drop function if exists rsvp_report();
drop function if exists submit_rsvp(uuid, jsonb, text);
drop function if exists get_invitation(uuid);
drop function if exists find_invitees(text);
drop function if exists name_word_matches(text, text);
drop function if exists name_words(text);
drop table if exists responses;
drop table if exists invitations;
drop table if exists invitees;
-- The previous per-guest model.
drop table if exists rsvps;
drop table if exists guests;
drop table if exists parties;

create table invitees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text not null default '' check (length(note) <= 500)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  invitee_id uuid not null references invitees(id) on delete cascade,
  event text not null check (event in ('ring-ceremony', 'reception', 'open-house')),
  seats int not null check (seats > 0),
  unique (invitee_id, event)
);

create table responses (
  invitation_id uuid primary key references invitations(id) on delete cascade,
  coming int not null check (coming >= 0),
  updated_at timestamptz not null default now()
);

alter table invitees enable row level security;
alter table invitations enable row level security;
alter table responses enable row level security;
revoke all on invitees, invitations, responses from anon, authenticated;

-- Name matching ---------------------------------------------------------------

-- Lowercase words of a name, without punctuation and without words that
-- appear on many invitations ("and", "family", "the").
create function name_words(value text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(w), '{}')
  from unnest(regexp_split_to_array(
         trim(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', ' ', 'g')),
         ' ')) as w
  where w <> '' and w not in ('and', 'family', 'the');
$$;

-- Whether one typed word matches one word of a name: exact, a prefix of three
-- or more letters ("matt" for "matthew"), or a small typo (one edit for words
-- of four to six letters, two edits for seven or more).
create function name_word_matches(typed text, actual text) returns boolean
language sql immutable set search_path = public, extensions as $$
  select typed = actual
      or (length(typed) >= 3 and left(actual, length(typed)) = typed)
      or (length(typed) >= 4 and
          extensions.levenshtein(typed, actual) <= case when length(typed) >= 7 then 2 else 1 end);
$$;

-- Guest-facing functions ------------------------------------------------------

-- Invitees whose name matches every typed word. Exact matches sort first.
-- Returns at most 10 rows and none for a blank query.
create function find_invitees(query text)
returns table (invitee_id uuid, name text)
language sql stable security definer set search_path = public, extensions as $$
  with typed as (
    select distinct w from unnest(name_words(left(query, 200))) as w
  ),
  scored as (
    select i.id, i.name,
      (select count(*) from typed t
        where exists (select 1 from unnest(name_words(i.name)) a where name_word_matches(t.w, a))) as hits,
      (select count(*) from typed t where t.w = any (name_words(i.name))) as exact
    from invitees i
  )
  select s.id, s.name
  from scored s
  where (select count(*) from typed) between 1 and 6
    and s.hits = (select count(*) from typed)
  order by s.exact desc, s.name
  limit 10;
$$;

-- One invitee's events, seats, and any saved answers, as JSON:
-- { "name": ..., "note": ..., "events": [ { "event", "seats", "coming" } ] }
create function get_invitation(invitee uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', i.name,
    'note', i.note,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('event', v.event, 'seats', v.seats, 'coming', r.coming)
                       order by array_position(array['ring-ceremony', 'reception', 'open-house'], v.event))
      from invitations v left join responses r on r.invitation_id = v.id
      where v.invitee_id = i.id), '[]'::jsonb))
  from invitees i
  where i.id = invitee;
$$;

-- Saves an invitee's whole RSVP at once. `answers` maps each event slug to the
-- number coming (0 = No). Every invited event must be answered, and nothing
-- else; each answer must be 0 to the event's seats.
create function submit_rsvp(invitee uuid, answers jsonb, note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  answer jsonb;
  n int;
begin
  if not exists (select 1 from invitees where id = invitee) then
    raise exception 'Unknown invitation';
  end if;
  if answers is null or jsonb_typeof(answers) <> 'object' then
    raise exception 'Answers must be an object';
  end if;
  if exists (select 1 from jsonb_object_keys(answers) k
             where k not in (select event from invitations where invitee_id = invitee)) then
    raise exception 'Answer given for an event not on this invitation';
  end if;
  if length(coalesce(note, '')) > 500 then
    raise exception 'Note is longer than 500 characters';
  end if;

  for inv in select id, event, seats from invitations where invitee_id = invitee loop
    answer := answers -> inv.event;
    if answer is null or jsonb_typeof(answer) <> 'number' then
      raise exception 'Missing answer for %', inv.event;
    end if;
    if (answer #>> '{}')::numeric <> trunc((answer #>> '{}')::numeric)
       or (answer #>> '{}')::numeric < 0 or (answer #>> '{}')::numeric > inv.seats then
      raise exception 'Answer for % must be a whole number from 0 to %', inv.event, inv.seats;
    end if;
    n := (answer #>> '{}')::int;
    insert into responses (invitation_id, coming, updated_at)
    values (inv.id, n, now())
    on conflict (invitation_id) do update set coming = excluded.coming, updated_at = excluded.updated_at;
  end loop;

  update invitees set note = coalesce(submit_rsvp.note, '') where id = invitee;
end;
$$;

-- Couple-facing report --------------------------------------------------------

-- Every invitation with its answer (coming is null until answered).
create function rsvp_report()
returns table (invitee_id uuid, name text, note text, event text, seats int, coming int, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.note, v.event, v.seats, r.coming, r.updated_at
  from invitees i
  join invitations v on v.invitee_id = i.id
  left join responses r on r.invitation_id = v.id
  order by lower(i.name), array_position(array['ring-ceremony', 'reception', 'open-house'], v.event);
$$;

revoke execute on function find_invitees(text), get_invitation(uuid),
  submit_rsvp(uuid, jsonb, text), rsvp_report() from public;
grant execute on function find_invitees(text), get_invitation(uuid),
  submit_rsvp(uuid, jsonb, text), rsvp_report() to anon, authenticated;
