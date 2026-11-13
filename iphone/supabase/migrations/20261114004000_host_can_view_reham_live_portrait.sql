-- Let only the approved Abdulrahman private-test session render Reham's
-- existing blurred live portrait. The object remains private and is never
-- copied into tester ownership, so tester cleanup cannot remove it.
create function nisfayn_test.live_reham_portrait(test_token text, photo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_name text;
  result jsonb;
begin
  select s.actor
    into actor_name
    from nisfayn_test.sessions s
    join marriage.admin_test_members m on m.actor=s.actor
   where s.token_hash=sha256(test_token::bytea)
     and s.expires_at>now()
     and m.review_status='approved'
     and not m.suspended
     and not m.paused
     and m.access_until>now();

  if actor_name is distinct from 'abdulrahman' then
    raise exception 'Portrait unavailable' using errcode='42501';
  end if;

  select jsonb_build_object(
    'id',p.id,
    'path',p.path,
    'blur',p.blur,
    'revealPolicy',p.reveal_policy,
    'hasClear',p.clear_path is not null,
    'revealed',false
  )
    into result
    from marriage.member_portraits p
   where p.member_id='4c6ad0d9-a5c5-42dd-bb6c-a0614e7341b9'::uuid
     and p.id=photo_id
     and p.ready;

  return result;
end;
$$;

create function public.nisfayn_test_live_reham_portrait(test_token text, photo_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select nisfayn_test.live_reham_portrait(test_token,photo_id)
$$;

revoke all on function nisfayn_test.live_reham_portrait(text,uuid),public.nisfayn_test_live_reham_portrait(text,uuid) from public,anon,authenticated;
grant execute on function nisfayn_test.live_reham_portrait(text,uuid),public.nisfayn_test_live_reham_portrait(text,uuid) to service_role;
