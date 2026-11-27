-- Each introduction between the two private QA accounts has its own archive target.
create table nisfayn_test.introduction_closures (
  id uuid primary key default gen_random_uuid(), actor text not null references marriage.admin_test_members(actor),
  context text not null check (context in ('general','pact')), allow_rematch boolean not null,
  started_at timestamptz not null, closed_at timestamptz not null default now()
);
alter table nisfayn_test.introduction_closures enable row level security;
revoke all on nisfayn_test.introduction_closures from public,anon,authenticated,service_role;

create function nisfayn_test.closure_notice(target text, recipient text) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('closureContext',c.context,'hasFamilyContact',false)
  from nisfayn_test.introduction_closures c where c.id::text=$1 and c.actor<>$2
    and $2 in ('reham','abdulrahman')
    and (select count(*) from marriage.admin_test_members m where m.actor in (c.actor,$2) and
      not m.paused and not m.suspended and m.review_status='approved' and m.access_until>now())=2
    and not exists(select from marriage.admin_test_reports where resolved_at is null)
    and not exists(select from nisfayn_test.room r where id and
      (r.data#>>'{hiddenPeople,abdulrahman}'='true' or r.data#>>'{hiddenPeople,reham}'='true'))
$$;
revoke all on function nisfayn_test.closure_notice(text,text) from public,anon,authenticated,service_role;

create function public.nisfayn_test_introduction(action text,session_token text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  room jsonb; who text; peer text; alias text; saved uuid; event text; choice text:=payload->>'closureContext';
  can_rematch boolean:=payload->'allowRematch'='true'::jsonb; result jsonb;
begin
  select s.actor into who from nisfayn_test.sessions s join marriage.admin_test_members m using(actor)
    where s.token_hash=sha256(session_token::bytea) and s.expires_at>now() and not m.suspended and m.access_until>now();
  if who is null or who not in('abdulrahman','reham') then raise insufficient_privilege; end if;
  peer:=case who when 'reham' then 'abdulrahman' else 'reham' end;
  if action='closure_history' then
    select coalesce(nullif(r.data#>>array['profiles',peer,'displayName'],''),case peer when 'reham' then 'رهام' else 'عبدالرحمن' end)
      into alias from nisfayn_test.room r where r.id;
    return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'alias',alias,
      'direction','mutual','createdAt',c.started_at,'closedAt',c.closed_at,'outcome','closed','resolution','ended',
      'closureContext',c.context,'hasFamilyContact',false,'canRequestAgain',c.allow_rematch) order by c.closed_at desc,c.id desc)
      from (select h.* from nisfayn_test.introduction_closures h
        where (payload->>'id' is null or h.id::text=payload->>'id') and
          (payload->>'beforeDate' is null or (h.closed_at,h.id::text)<((payload->>'beforeDate')::timestamptz,payload->>'beforeId'))
        order by h.closed_at desc,h.id desc limit 50) c), '[]'::jsonb);
  end if;
  if action<>'close_introduction' or choice is null or choice not in('pact','general') or payload ? 'familyPhone'
    then raise exception 'هذا الإجراء غير متاح.' using errcode='22023'; end if;
  select data into strict room from nisfayn_test.room where id for update;
  if room->>'matched' is distinct from 'true' then return public.nisfayn_test_rpc('state',session_token,'{}'); end if;
  if choice='pact' and (coalesce(room#>>'{seriousness,status}','') not in ('accepted','family','expired')
    or nullif(room#>>'{seriousness,womanSignedAt}','') is null or nullif(room#>>'{seriousness,manSignedAt}','') is null)
    then raise exception 'ما فيه ميثاق موقّع بينكم.' using errcode='22023'; end if;
  result:=public.nisfayn_test_rpc('close',session_token,jsonb_build_object('allowRematch',coalesce(can_rematch,false)));
  insert into nisfayn_test.introduction_closures(actor,context,allow_rematch,started_at)
    values(who,choice,coalesce(can_rematch,false),coalesce(nullif(room->>'matchedAt','')::timestamptz,now())) returning id into saved;
  event:='introduction:closed:'||saved::text;
  perform nisfayn_test.queue_member_update(peer,event);
  update marriage.notification_updates set target_id=saved where test_actor=peer and event_key=event;
  return result;
end $$;
revoke all on function public.nisfayn_test_introduction(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nisfayn_test_introduction(text,text,jsonb) to service_role;

-- The test pair is already closed at delivery. Keep the active device/session and
-- account checks used for other post-relationship updates, with a recipient-owned target.
do $$
declare original text; revised text;
begin
  original:=pg_get_functiondef('nisfayn_test.push_allowed(nisfayn_test.push_outbox)'::regprocedure);
  revised:=replace(original,'if split_part(job.event_key,'':'',1) in (''rematch'',',
    'if job.event_key like ''introduction:closed:%'' and nisfayn_test.closure_notice(split_part(job.event_key,'':'',3),job.actor) is null then return false; end if;
     if job.event_key like ''introduction:closed:%'' or split_part(job.event_key,'':'',1) in (''rematch'',');
  if original=revised then raise exception 'Unexpected QA update eligibility'; end if;
  execute revised;

  original:=pg_get_functiondef('marriage.read_notification_updates(uuid,text,uuid)'::regprocedure);
  revised:=replace(original,'then marriage.introduction_notice_details(u.target_id,owner) else',
    'then marriage.introduction_notice_details(u.target_id,owner)
     when actor is not null and u.event_key like ''introduction:closed:%'' then nisfayn_test.closure_notice(u.target_id::text,actor)
     else');
  if original=revised then raise exception 'Unexpected QA notification projection'; end if;
  execute revised;

  original:=pg_get_functiondef('public.nisfayn_push_delivery(uuid,uuid,boolean,text)'::regprocedure);
  revised:=replace(original,'if token is distinct from claimed_token',
    'if tester and event like ''introduction:closed:%'' then target:=split_part(event,'':'',3)::uuid; end if;
     if token is distinct from claimed_token');
  if original=revised then raise exception 'Unexpected QA push target'; end if;
  original:=revised;
  revised:=replace(original,'case when not tester and event like ''introduction:closed:%''',
    'case when tester and event like ''introduction:closed:%'' and mode in (''event'',''name'',''content'') then
       (select jsonb_build_object(''closureContext'',c.context,''hasFamilyContact'',false) from nisfayn_test.introduction_closures c where c.id=target)
     when not tester and event like ''introduction:closed:%''');
  if original=revised then raise exception 'Unexpected QA push preview'; end if;
  execute revised;
end $$;
