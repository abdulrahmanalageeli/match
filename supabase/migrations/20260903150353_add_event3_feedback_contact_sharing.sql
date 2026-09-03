-- Event3 one-to-one feedback keeps the participant's selected contact channel
-- with each round. Existing affirmative feedback retains its historical phone-
-- sharing behavior; new custom messages are validated before persistence.

create or replace function public.event3_feedback_contact_is_valid(p_feedback jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_feedback is null then true
    when pg_catalog.jsonb_typeof(p_feedback) <> 'object' then false
    when p_feedback ? 'contactMethod'
      and (
        pg_catalog.jsonb_typeof(p_feedback -> 'contactMethod') <> 'string'
        or p_feedback ->> 'contactMethod' not in ('phone', 'message')
      ) then false
    when p_feedback ? 'contactMessage'
      and (
        pg_catalog.jsonb_typeof(p_feedback -> 'contactMessage') <> 'string'
        or pg_catalog.char_length(p_feedback ->> 'contactMessage') > 240
      ) then false
    when not (p_feedback ? 'wantConnect') then true
    when pg_catalog.jsonb_typeof(p_feedback -> 'wantConnect') <> 'boolean' then false
    when (p_feedback ->> 'wantConnect')::boolean = false then true
    when p_feedback ->> 'contactMethod' = 'phone' then true
    when p_feedback ->> 'contactMethod' = 'message' then
      p_feedback ? 'contactMessage'
      and pg_catalog.btrim(p_feedback ->> 'contactMessage') <> ''
    else false
  end;
$$;

-- Normalize all historical feedback before validating the table. A historical
-- "yes" had only one meaning: share the saved phone number.
update public.event3_matches
set phase2_feedback = case
  when phase2_feedback -> 'wantConnect' = 'true'::jsonb then
    case
      when phase2_feedback ->> 'contactMethod' = 'message'
        and pg_catalog.jsonb_typeof(phase2_feedback -> 'contactMessage') = 'string'
        and pg_catalog.btrim(phase2_feedback ->> 'contactMessage') <> ''
        and pg_catalog.char_length(phase2_feedback ->> 'contactMessage') <= 240
        then phase2_feedback
      else pg_catalog.jsonb_set(phase2_feedback - 'contactMessage', '{contactMethod}', '"phone"'::jsonb, true)
    end
  when phase2_feedback ? 'wantConnect' then phase2_feedback - 'contactMethod' - 'contactMessage'
  else phase2_feedback
end
where phase2_feedback is not null;

update public.event3_matches
set phase3_feedback = case
  when phase3_feedback -> 'wantConnect' = 'true'::jsonb then
    case
      when phase3_feedback ->> 'contactMethod' = 'message'
        and pg_catalog.jsonb_typeof(phase3_feedback -> 'contactMessage') = 'string'
        and pg_catalog.btrim(phase3_feedback ->> 'contactMessage') <> ''
        and pg_catalog.char_length(phase3_feedback ->> 'contactMessage') <= 240
        then phase3_feedback
      else pg_catalog.jsonb_set(phase3_feedback - 'contactMessage', '{contactMethod}', '"phone"'::jsonb, true)
    end
  when phase3_feedback ? 'wantConnect' then phase3_feedback - 'contactMethod' - 'contactMessage'
  else phase3_feedback
end
where phase3_feedback is not null;

update public.event3_matches
set phase4_feedback = case
  when phase4_feedback -> 'wantConnect' = 'true'::jsonb then
    case
      when phase4_feedback ->> 'contactMethod' = 'message'
        and pg_catalog.jsonb_typeof(phase4_feedback -> 'contactMessage') = 'string'
        and pg_catalog.btrim(phase4_feedback ->> 'contactMessage') <> ''
        and pg_catalog.char_length(phase4_feedback ->> 'contactMessage') <= 240
        then phase4_feedback
      else pg_catalog.jsonb_set(phase4_feedback - 'contactMessage', '{contactMethod}', '"phone"'::jsonb, true)
    end
  when phase4_feedback ? 'wantConnect' then phase4_feedback - 'contactMethod' - 'contactMessage'
  else phase4_feedback
end
where phase4_feedback is not null;

alter table public.event3_matches drop constraint if exists event3_matches_phase2_feedback_contact_valid;
alter table public.event3_matches add constraint event3_matches_phase2_feedback_contact_valid
  check (public.event3_feedback_contact_is_valid(phase2_feedback));
alter table public.event3_matches drop constraint if exists event3_matches_phase3_feedback_contact_valid;
alter table public.event3_matches add constraint event3_matches_phase3_feedback_contact_valid
  check (public.event3_feedback_contact_is_valid(phase3_feedback));
alter table public.event3_matches drop constraint if exists event3_matches_phase4_feedback_contact_valid;
alter table public.event3_matches add constraint event3_matches_phase4_feedback_contact_valid
  check (public.event3_feedback_contact_is_valid(phase4_feedback));

revoke all on function public.event3_feedback_contact_is_valid(jsonb) from public, anon, authenticated;
grant execute on function public.event3_feedback_contact_is_valid(jsonb) to service_role;

comment on function public.event3_feedback_contact_is_valid(jsonb) is
  'Validates phone-or-message contact sharing embedded in Event3 one-to-one feedback JSONB.';
