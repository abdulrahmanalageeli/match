-- Canonical phone identity and race-safe duplicate prevention.
-- Existing duplicate exceptions remain readable/editable while any new claim
-- of an already-used phone is rejected.

create or replace function public.normalize_participant_phone(value text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  digits text;
begin
  digits := regexp_replace(
    translate(
      translate(coalesce(value, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'),
      '۰۱۲۳۴۵۶۷۸۹',
      '0123456789'
    ),
    '\D',
    '',
    'g'
  );

  if digits = '' then return ''; end if;
  if digits like '00%' then digits := substring(digits from 3); end if;
  if digits ~ '^05[0-9]{8}$' then return '966' || substring(digits from 2); end if;
  if digits ~ '^5[0-9]{8}$' then return '966' || digits; end if;
  return digits;
end;
$$;

revoke all on function public.normalize_participant_phone(text) from public, anon, authenticated;
grant execute on function public.normalize_participant_phone(text) to service_role;

alter table public.participants
  add column if not exists phone_normalized text
  generated always as (public.normalize_participant_phone(phone_number)) stored;

alter table public.participants
  add column if not exists phone_identity_legacy_exception boolean
  not null default false;

-- Preserve only the duplicate identities that already existed before this
-- guard. New inserts and phone changes are always forced back into the unique
-- set by the trigger below.
update public.participants p
set phone_identity_legacy_exception = true
where p.phone_normalized <> ''
  and exists (
    select 1
    from public.participants duplicate
    where duplicate.phone_normalized = p.phone_normalized
      and duplicate.id <> p.id
  );

create index if not exists participants_phone_normalized_idx
  on public.participants(phone_normalized)
  where phone_normalized <> '';

create unique index if not exists participants_phone_normalized_unique_new_idx
  on public.participants(phone_normalized)
  where phone_normalized <> ''
    and phone_identity_legacy_exception = false;

create or replace function public.prevent_duplicate_participant_phone()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized_phone text;
  old_normalized_phone text;
begin
  normalized_phone := public.normalize_participant_phone(new.phone_number);
  if normalized_phone = '' then return new; end if;

  if tg_op = 'UPDATE' then
    old_normalized_phone := public.normalize_participant_phone(old.phone_number);
    if normalized_phone = old_normalized_phone then return new; end if;
  end if;

  -- An exception is historical metadata, never something a new claim can
  -- inherit or request.
  new.phone_identity_legacy_exception := false;

  if exists (
    select 1
    from public.participants p
    where p.phone_normalized = normalized_phone
      and p.id <> new.id
  ) then
    raise exception 'participant phone already belongs to an existing account'
      using errcode = '23505',
            constraint = 'participants_phone_identity_unique';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_duplicate_participant_phone() from public, anon, authenticated;
grant execute on function public.prevent_duplicate_participant_phone() to service_role;

drop trigger if exists participants_prevent_duplicate_phone on public.participants;
create trigger participants_prevent_duplicate_phone
before insert or update of phone_number on public.participants
for each row execute function public.prevent_duplicate_participant_phone();

comment on column public.participants.phone_normalized is
  'Canonical phone identity used for exact account lookup and duplicate prevention.';

comment on column public.participants.phone_identity_legacy_exception is
  'True only for phone duplicates that predated canonical uniqueness enforcement.';
