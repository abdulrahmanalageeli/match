-- One abuse window per verified principal, shared by every Luna endpoint.
create table marriage.luna_access_windows (
  owner_key text primary key,
  member_id uuid references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  strikes smallint not null check (strikes between 1 and 3),
  locked_until timestamptz
);
create index luna_access_member on marriage.luna_access_windows(member_id) where member_id is not null;
alter table marriage.luna_access_windows enable row level security;
revoke all on marriage.luna_access_windows from public, anon, authenticated, service_role;

create function nisfayn_ai.luna_guard(test_token text, refused boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_key text; member uuid; state marriage.luna_access_windows; moment timestamptz;
begin
  if coalesce(test_token,'') = '' then
    member := marriage.require_member();
    actor_key := 'member:' || member::text;
  else
    if auth.uid() is not null or test_token !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid session' using errcode='42501';
    end if;
    select 'tester:' || s.actor into actor_key from nisfayn_test.sessions s
      join marriage.admin_test_members m on m.actor=s.actor
      where s.token_hash=sha256(test_token::bytea) and s.expires_at>now()
        and m.review_status='approved' and not m.suspended and not m.paused and m.access_until>now();
    if actor_key is null then raise exception 'Invalid session' using errcode='42501'; end if;
  end if;

  -- Only refusals can write, and callers can only affect their own account.
  if refused then perform pg_advisory_xact_lock(hashtextextended('luna-guard:' || actor_key,0)); end if;
  moment := clock_timestamp();
  select * into state from marriage.luna_access_windows where owner_key=actor_key;
  if state.locked_until > moment then
    return jsonb_build_object('status','locked','retryAfter',ceil(extract(epoch from state.locked_until-moment))::int);
  end if;
  if not refused then return jsonb_build_object('status','allowed'); end if;
  if state.window_start is null or state.window_start <= moment - interval '24 hours' then
    state.window_start := moment; state.strikes := 0;
  end if;
  state.strikes := state.strikes + 1;
  state.locked_until := case when state.strikes=3 then moment + interval '24 hours' end;
  insert into marriage.luna_access_windows values(actor_key, member, state.window_start, state.strikes, state.locked_until)
    on conflict(owner_key) do update set window_start=excluded.window_start, strikes=excluded.strikes, locked_until=excluded.locked_until;
  if state.strikes=3 then return jsonb_build_object('status','locked','retryAfter',86400); end if;
  return jsonb_build_object('status','warning','remaining',3-state.strikes);
end $$;
create function public.wudayn_luna_guard(test_token text default null, refused boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select nisfayn_ai.luna_guard($1,$2) $$;
revoke all on function public.wudayn_luna_guard(text,boolean),nisfayn_ai.luna_guard(text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.wudayn_luna_guard(text,boolean),nisfayn_ai.luna_guard(text,boolean) to anon, authenticated;
