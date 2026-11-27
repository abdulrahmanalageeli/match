-- The member chooses the context. Signing a pact alone does not make every later closure a pact decision.
alter table marriage.member_requests add column closure_context text
  check (closure_context in ('general','pact'));

create function public.marriage_close_introduction(selected_request uuid, closure_context text,
  allow_rematch boolean default false, family_phone text default null)
returns void language plpgsql security definer set search_path='' as $$
declare member uuid:=marriage.require_member(); r marriage.member_requests;
begin
  if $2 is null or $2 not in ('general','pact') then
    raise exception 'اختَر طريقة إنهاء التعارف.' using errcode='22023';
  end if;
  select * into r from marriage.member_requests where id=$1 and member in (requester_id,recipient_id);
  if not found then raise exception 'التعارف غير متاح.' using errcode='42501'; end if;
  perform marriage.lock_member_pair(r.requester_id,r.recipient_id);
  select * into strict r from marriage.member_requests where id=$1 for update;
  if r.status='cancelled' and r.notice_resolution='ended' and r.analytics_closed_by=member
      and coalesce(r.closure_context,'general')=$2 and r.allow_rematch=coalesce($3,false) then
    if $4 is not null then perform public.marriage_share_family_contact($1,$4,true,$3); end if;
    return;
  end if;
  if r.status<>'accepted' then raise exception 'التعارف غير متاح.' using errcode='42501'; end if;
  if $2='pact' and not exists(select from marriage.conversation_agreements a where a.request_id=$1
        and a.data->>'status' in ('accepted','family','expired')
        and nullif(a.data->>'womanSignedAt','') is not null and nullif(a.data->>'manSignedAt','') is not null) then
    raise exception 'ما فيه ميثاق موقّع بينكم.' using errcode='22023';
  end if;
  update marriage.member_requests set closure_context=$2 where id=$1;
  if $4 is null then
    perform marriage.cancel_request($1,$3);
  else
    perform public.marriage_share_family_contact($1,$4,true,$3);
  end if;
end $$;
revoke all on function public.marriage_close_introduction(uuid,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.marriage_close_introduction(uuid,text,boolean,text) to authenticated;

-- The same closure event also exists for automatic exclusivity clean-up. Keep its neutral wording.
-- SQL NULL suppresses old notices across a later safety boundary; an empty object keeps neutral notices.
create function marriage.introduction_notice_details(target uuid, recipient uuid)
returns jsonb language sql stable set search_path='' as $$
  select case when r.status='cancelled' and r.notice_resolution='ended'
        and r.analytics_closed_by in (r.requester_id,r.recipient_id)
    then jsonb_build_object('closureContext',coalesce(r.closure_context,'general'),
      'hasFamilyContact',exists(select from marriage.pact_family_contacts c where c.request_id=r.id))
    else '{}'::jsonb end
  from marriage.member_requests r
  where r.id=$1 and $2 in (r.requester_id,r.recipient_id) and r.status in ('closed','cancelled')
    and (r.status<>'cancelled' or r.analytics_closed_by is distinct from $2)
    and marriage.relationship_member_allowed(r.requester_id) and marriage.relationship_member_allowed(r.recipient_id)
    and not exists(select from marriage.blocks b where (b.member_id,b.blocked_id) in
      ((r.requester_id,r.recipient_id),(r.recipient_id,r.requester_id)))
    and not exists(select from marriage.reports p where (p.member_id,p.reported_id) in
      ((r.requester_id,r.recipient_id),(r.recipient_id,r.requester_id)))
$$;
revoke all on function marriage.introduction_notice_details(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function marriage.read_notification_updates(owner uuid,actor text,read_id uuid)
returns jsonb language plpgsql set search_path='' as $$
begin
 if read_id is not null then
  update marriage.notification_updates u set read_at=coalesce(u.read_at,now())
  where u.id=read_id and (u.member_id=owner or u.test_actor=actor);
  return '[]'::jsonb;
 end if;
 return coalesce((select jsonb_agg(q.item order by q.created_at desc,q.id desc) from (
  select u.id,u.created_at,jsonb_build_object('id',u.id,
    'event',split_part(u.event_key,':',1)||':'||split_part(u.event_key,':',2),'target',u.target_id,
    'createdAt',u.created_at,'unread',u.read_at is null,'hasFamilyContact',false)||notice.details as item
  from marriage.notification_updates u
  cross join lateral (select case when owner is not null and u.event_key like 'introduction:closed:%'
    then marriage.introduction_notice_details(u.target_id,owner) else '{}'::jsonb end as details) notice
  where (u.member_id=owner or u.test_actor=actor) and u.created_at>now()-interval '7 days' and notice.details is not null
    and (u.request_id is null or exists(select from marriage.member_requests r where r.id=u.request_id
      and r.status='accepted' and owner in(r.requester_id,r.recipient_id) and marriage.compatible(r.requester_id,r.recipient_id)))
    and marriage.member_update_current(u)
  order by u.created_at desc,u.id desc limit 25
 ) q),'[]'::jsonb);
end $$;

do $$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('marriage.closed_introduction_row(marriage.member_requests,uuid)'::regprocedure);
  patched:=replace(definition,'''hasFamilyContact'',', $patch$'closureContext',
    case when r.status='cancelled' and r.notice_resolution='ended' and marriage.family_contact_allowed(r,member)
      then coalesce(r.closure_context,'general') end,
    'hasFamilyContact',$patch$);
  if patched=definition then raise exception 'Unexpected history projection'; end if;
  execute patched;

  definition:=pg_get_functiondef('marriage.push_allowed(marriage.push_outbox)'::regprocedure);
  patched:=replace(definition,'if job.kind<>''update'' then', $patch$if job.kind='update' and job.event_key like 'introduction:closed:%'
    and marriage.introduction_notice_details(job.update_target,job.member_id) is null then return false; end if;
    if job.kind<>'update' then$patch$);
  if patched=definition then raise exception 'Unexpected update push eligibility'; end if;
  execute patched;

  definition:=pg_get_functiondef('public.nisfayn_push_delivery(uuid,uuid,boolean,text)'::regprocedure);
  patched:=replace(definition,'''sound'',coalesce((controls->>''sound'')::boolean,true));',
    $patch$'sound',coalesce((controls->>'sound')::boolean,true))
    || case when not tester and event like 'introduction:closed:%' and mode in ('event','name','content')
       then coalesce(marriage.introduction_notice_details(target,member),'{}'::jsonb) else '{}'::jsonb end;$patch$);
  if patched=definition then raise exception 'Unexpected device preview projection'; end if;
  execute patched;
end $$;
