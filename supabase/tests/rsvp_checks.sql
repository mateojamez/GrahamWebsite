-- Checks for supabase/schema.sql. Paste into the Supabase SQL editor after the
-- schema; everything runs in a transaction that rolls back, so no test data
-- stays behind. Success: the last result is 'all rsvp checks passed'.
-- Names here are invented.

begin;

insert into invitees (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Jared and Anita Testmora and Family'),
  ('00000000-0000-0000-0000-000000000002', 'Pat O''Brien-Lee'),
  ('00000000-0000-0000-0000-000000000003', 'Sam Testmora');

insert into invitations (id, invitee_id, event, seats) values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'ring-ceremony', 4),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'reception', 4),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'open-house', 4),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000002', 'reception', 1),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000002', 'open-house', 1),
  ('00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0000-000000000003', 'reception', 2),
  ('00000000-0000-0000-0001-000000000007', '00000000-0000-0000-0000-000000000003', 'open-house', 2);

do $$
declare
  a uuid := '00000000-0000-0000-0000-000000000001';
  p uuid := '00000000-0000-0000-0000-000000000002';
  failed boolean;
  inv jsonb;
begin
  -- Lookup
  if not exists (select 1 from find_invitees('Anita Testmora') where invitee_id = a) then
    raise exception 'full name of a person inside a name line should match';
  end if;
  if (select count(*) from find_invitees('Anita Testmora')) <> 1 then
    raise exception 'Anita Testmora should match only her invitation';
  end if;
  if (select count(*) from find_invitees('testmora')) <> 2 then
    raise exception 'a last name alone should match both Testmora invitations';
  end if;
  if (select invitee_id from find_invitees('Sam Testmora') limit 1) <> '00000000-0000-0000-0000-000000000003' then
    raise exception 'Sam Testmora should match Sam';
  end if;
  if not exists (select 1 from find_invitees('anita testmorra') where invitee_id = a) then
    raise exception 'a one-letter typo should still match';
  end if;
  if not exists (select 1 from find_invitees('jar testmora') where invitee_id = a) then
    raise exception 'a three-letter prefix should match';
  end if;
  if not exists (select 1 from find_invitees('pat o''brien-lee') where invitee_id = p) then
    raise exception 'apostrophes and hyphens should match their own spelling';
  end if;
  if not exists (select 1 from find_invitees('Pat OBrien Lee') where invitee_id = p) then
    raise exception 'punctuation should not matter';
  end if;
  if exists (select 1 from find_invitees('   ')) then
    raise exception 'a blank query should match nothing';
  end if;
  if exists (select 1 from find_invitees('and family')) then
    raise exception 'only filler words should match nothing';
  end if;
  if exists (select 1 from find_invitees('Zebulon Quixote')) then
    raise exception 'an unknown name should match nothing';
  end if;
  if exists (select 1 from find_invitees('Ja')) then
    raise exception 'two letters should not prefix-match';
  end if;

  -- get_invitation
  inv := get_invitation(a);
  if inv ->> 'name' <> 'Jared and Anita Testmora and Family'
     or jsonb_array_length(inv -> 'events') <> 3
     or inv #>> '{events,0,event}' <> 'ring-ceremony'
     or inv #>> '{events,2,event}' <> 'open-house'
     or (inv #> '{events,0,coming}') <> 'null'::jsonb then
    raise exception 'get_invitation returned %', inv;
  end if;
  if get_invitation(gen_random_uuid()) is not null then
    raise exception 'an unknown invitee should return null';
  end if;

  -- submit_rsvp rejects bad answers
  foreach inv in array array[
    '{"reception": 1, "open-house": 1}'::jsonb,                          -- missing ring-ceremony
    '{"ring-ceremony": 5, "reception": 1, "open-house": 1}',             -- over seats
    '{"ring-ceremony": -1, "reception": 1, "open-house": 1}',            -- negative
    '{"ring-ceremony": 1.5, "reception": 1, "open-house": 1}',           -- fraction
    '{"ring-ceremony": "2", "reception": 1, "open-house": 1}',           -- string
    '{"ring-ceremony": null, "reception": 1, "open-house": 1}',          -- null
    '{"ring-ceremony": 1, "reception": 1, "open-house": 1, "temple": 1}' -- extra event
  ] loop
    failed := false;
    begin
      perform submit_rsvp(a, inv, '');
    exception when others then failed := true;
    end;
    if not failed then raise exception 'submit_rsvp accepted %', inv; end if;
  end loop;

  failed := false;
  begin perform submit_rsvp(p, '{"ring-ceremony": 1, "reception": 1, "open-house": 1}', '');
  exception when others then failed := true; end;
  if not failed then raise exception 'an event not on the invitation should be rejected'; end if;

  failed := false;
  begin perform submit_rsvp(a, '{"ring-ceremony": 1, "reception": 1, "open-house": 1}', repeat('x', 501));
  exception when others then failed := true; end;
  if not failed then raise exception 'a note over 500 characters should be rejected'; end if;

  failed := false;
  begin perform submit_rsvp(gen_random_uuid(), '{}', '');
  exception when others then failed := true; end;
  if not failed then raise exception 'an unknown invitee should be rejected'; end if;

  if exists (select 1 from responses) then
    raise exception 'a rejected submit should save nothing';
  end if;

  -- submit_rsvp saves, then a second submit updates in place
  perform submit_rsvp(a, '{"ring-ceremony": 4, "reception": 3, "open-house": 0}', 'one vegetarian');
  perform submit_rsvp(a, '{"ring-ceremony": 2, "reception": 3, "open-house": 0}', 'none');
  if (select count(*) from responses) <> 3 then
    raise exception 'resubmitting should update, not add rows';
  end if;
  inv := get_invitation(a);
  if inv ->> 'note' <> 'none' or (inv #>> '{events,0,coming}')::int <> 2
     or (inv #>> '{events,2,coming}')::int <> 0 then
    raise exception 'saved answers are wrong: %', inv;
  end if;

  -- Report
  if (select count(*) from rsvp_report()) <> 7 then
    raise exception 'the report should list every invitation';
  end if;
  if (select count(*) from rsvp_report() where coming is null) <> 4 then
    raise exception 'unanswered invitations should report null';
  end if;
end;
$$;

select 'all rsvp checks passed' as result;

rollback;
