create table if not exists public.circle_events (
  id text primary key,
  title text not null,
  subtitle text not null,
  event_date date not null,
  slides jsonb not null default '[]'::jsonb check (jsonb_typeof(slides) = 'array'),
  current_slide_id text,
  voting_open boolean not null default false,
  revealed boolean not null default true,
  ends_at timestamptz,
  host_code_hash text check (host_code_hash is null or host_code_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.circle_participants (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.circle_events(id),
  name text not null check (char_length(name) between 2 and 40),
  login_code_hash text not null check (login_code_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, login_code_hash),
  unique (event_id, id)
);
create unique index if not exists circle_participants_active_name
  on public.circle_participants (event_id, lower(btrim(name))) where active;

create table if not exists public.circle_event_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  event_id text not null references public.circle_events(id),
  kind text not null check (kind in ('participant', 'host')),
  participant_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (event_id, participant_id) references public.circle_participants(event_id, id),
  check ((kind = 'host' and participant_id is null) or (kind = 'participant' and participant_id is not null))
);
create index if not exists circle_event_sessions_participant on public.circle_event_sessions(participant_id);

create table if not exists public.circle_votes (
  event_id text not null references public.circle_events(id),
  participant_id uuid not null,
  slide_id text not null,
  choice smallint not null check (choice between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, participant_id, slide_id),
  foreign key (event_id, participant_id) references public.circle_participants(event_id, id)
);

create table if not exists public.circle_event_rate_limits (
  event_id text not null references public.circle_events(id),
  action text not null,
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  bucket_start timestamptz not null,
  attempts integer not null default 1,
  primary key (event_id, action, subject_hash, bucket_start)
);
create index if not exists circle_event_rate_limits_expiry on public.circle_event_rate_limits(bucket_start);

alter table public.circle_events enable row level security;
alter table public.circle_participants enable row level security;
alter table public.circle_event_sessions enable row level security;
alter table public.circle_votes enable row level security;
alter table public.circle_event_rate_limits enable row level security;
revoke all on table public.circle_events, public.circle_participants, public.circle_event_sessions,
  public.circle_votes, public.circle_event_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.circle_events, public.circle_participants,
  public.circle_event_sessions, public.circle_votes, public.circle_event_rate_limits to service_role;

insert into public.circle_events (id, title, subtitle, event_date)
values ('the-circle-2026-10-07', 'THE CIRCLE', 'الحدود والديل بريكرز', '2026-10-07')
on conflict (id) do nothing;
-- The deployment seeds slides/current_slide_id and host_code_hash separately.
-- Host and participant codes are SHA-256 hex of code.trim().toUpperCase().

create or replace function public.circle_event_rate_limit(
  p_event_id text, p_action text, p_subject_hash text, p_limit integer
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_attempts integer;
begin
  if p_limit not between 1 and 240 or p_action not in ('join', 'login', 'hostLogin') then
    return false;
  end if;
  delete from public.circle_event_rate_limits where bucket_start < now() - interval '2 days';
  insert into public.circle_event_rate_limits(event_id, action, subject_hash, bucket_start, attempts)
  values (p_event_id, p_action, p_subject_hash, date_trunc('minute', now()), 1)
  on conflict (event_id, action, subject_hash, bucket_start)
  do update set attempts = public.circle_event_rate_limits.attempts + 1
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;

create or replace function public.circle_event_vote(
  p_event_id text, p_participant_id uuid, p_slide_id text, p_choice integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_event public.circle_events%rowtype; v_active boolean; v_slide jsonb;
begin
  if p_choice not between 1 and 4 then return jsonb_build_object('ok', false, 'code', 'invalid_choice'); end if;
  select * into v_event from public.circle_events where id = p_event_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'event_missing'); end if;
  select active into v_active from public.circle_participants
    where id = p_participant_id and event_id = p_event_id for update;
  if not found or not v_active then return jsonb_build_object('ok', false, 'code', 'inactive'); end if;
  if v_event.current_slide_id is distinct from p_slide_id then
    return jsonb_build_object('ok', false, 'code', 'slide_changed');
  end if;
  select item into v_slide from jsonb_array_elements(v_event.slides) item where item->>'id' = p_slide_id;
  if v_slide is null or v_slide->>'kind' <> 'scenario' or coalesce(v_slide->>'responseMode', '') <> 'vote'
     or not v_event.voting_open
     or v_event.ends_at is null or v_event.ends_at <= clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;
  insert into public.circle_votes(event_id, participant_id, slide_id, choice)
    values (p_event_id, p_participant_id, p_slide_id, p_choice)
  on conflict (event_id, participant_id, slide_id) do update set choice = excluded.choice, updated_at = now();
  return jsonb_build_object('ok', true, 'choice', p_choice);
end;
$$;

create or replace function public.circle_event_remove(p_event_id text, p_participant_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.circle_participants set active = false where event_id = p_event_id and id = p_participant_id;
  if not found then return false; end if;
  delete from public.circle_event_sessions where event_id = p_event_id and participant_id = p_participant_id;
  return true;
end;
$$;

create or replace function public.circle_event_reset_code(p_event_id text, p_participant_id uuid, p_code_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.circle_participants set login_code_hash = p_code_hash
    where event_id = p_event_id and id = p_participant_id;
  if not found then return false; end if;
  delete from public.circle_event_sessions where event_id = p_event_id and participant_id = p_participant_id;
  return true;
end;
$$;

revoke all on function public.circle_event_rate_limit(text,text,text,integer) from public, anon, authenticated;
revoke all on function public.circle_event_vote(text,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.circle_event_remove(text,uuid) from public, anon, authenticated;
revoke all on function public.circle_event_reset_code(text,uuid,text) from public, anon, authenticated;
grant execute on function public.circle_event_rate_limit(text,text,text,integer) to service_role;
grant execute on function public.circle_event_vote(text,uuid,text,integer) to service_role;
grant execute on function public.circle_event_remove(text,uuid) to service_role;
grant execute on function public.circle_event_reset_code(text,uuid,text) to service_role;
