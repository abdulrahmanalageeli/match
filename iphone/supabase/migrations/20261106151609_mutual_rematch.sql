-- Keep past conversations closed; opt-in permits a new request with fresh consent.
alter table marriage.member_requests add column allow_rematch boolean not null default false;
drop index marriage.member_requests_pair;
create unique index member_requests_pair on marriage.member_requests
 (least(requester_id,recipient_id),greatest(requester_id,recipient_id)) where status in('pending','accepted');

create function marriage.cancel_request(request_id uuid,allow_rematch boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); r marriage.member_requests; begin
 select * into r from marriage.member_requests where id=$1 and me in(requester_id,recipient_id);
 if not found then raise exception 'الطلب غير متاح.' using errcode='42501';end if;
 perform marriage.lock_member_pair(r.requester_id,r.recipient_id);
 select * into r from marriage.member_requests where id=$1 for update;
 if r.status='cancelled' then return true;end if;
 perform marriage.act_request($1,'cancel',null);
 update marriage.member_requests set allow_rematch=coalesce($2,false) where id=$1;
 return true;
end $$;
create function public.marriage_cancel(request_id uuid,allow_rematch boolean default false) returns boolean
language sql security invoker set search_path='' as $$select marriage.cancel_request($1,$2)$$;
revoke all on function marriage.cancel_request(uuid,boolean),public.marriage_cancel(uuid,boolean) from public,anon;
grant execute on function marriage.cancel_request(uuid,boolean),public.marriage_cancel(uuid,boolean) to authenticated;

create or replace function marriage.request_member(member_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); r marriage.member_requests; requested uuid;
begin
 if member_id is null or member_id=me then raise exception 'العضو غير متاح.' using errcode='42501';end if;
 perform marriage.lock_member_pair(me,member_id);
 if not marriage.is_paid(me) or not marriage.is_paid(member_id) or not marriage.compatible(me,member_id) then
  raise exception 'العضو غير متاح.' using errcode='42501';end if;
 select * into r from marriage.member_requests x where me in(x.requester_id,x.recipient_id)
  and member_id in(x.requester_id,x.recipient_id) and x.status in('pending','accepted');
 if found then return r.id;end if;
 if exists(select 1 from marriage.member_requests x where me in(x.requester_id,x.recipient_id)
  and member_id in(x.requester_id,x.recipient_id) and not(x.status='cancelled' and x.allow_rematch)) then
  raise exception 'لا يسمح هذا العضو بالتعارف مجددًا.' using errcode='42501';end if;
 if exists(select 1 from marriage.introductions i where i.member_a=least(me,member_id) and i.member_b=greatest(me,member_id)) then
  raise exception 'سبق ترشيح هذا العضو.' using errcode='P0001';end if;
 if (select count(*) from marriage.member_requests x where x.requester_id=me and x.status in('pending','accepted'))>=5 then
  raise exception 'لديك خمسة طلبات مفتوحة.' using errcode='P0001';end if;
 insert into marriage.member_requests(requester_id,recipient_id) values(me,member_id) returning id into requested;
 return requested;
end $$;

-- Preserve the complete existing filters while exempting explicit opt-in cancellations.
do $$ declare def text;begin
 def:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 if position('r.status in(''closed'',''cancelled'',''declined'')' in def)=0 then raise exception 'Unexpected browse definition';end if;
 def:=replace(def,'r.status in(''closed'',''cancelled'',''declined'')','r.status in(''closed'',''cancelled'',''declined'') and not(r.status=''cancelled'' and r.allow_rematch)');execute def;
 def:=pg_get_functiondef('marriage.discover(integer,integer,text,uuid)'::regprocedure);
 def:=replace(def,'and greatest(r.requester_id,r.recipient_id)=greatest(me,s.candidate_id))','and greatest(r.requester_id,r.recipient_id)=greatest(me,s.candidate_id) and not(r.status=''cancelled'' and r.allow_rematch))');execute def;
end $$;

-- The private two-person preview uses the same explicit request/accept lifecycle.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_rematch;
revoke all on function nisfayn_test.rpc_before_rematch(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text; d jsonb; result jsonb;begin
 if action not in('close','rematch_request','rematch_accept','rematch_decline','match_seen') then
  return nisfayn_test.rpc_before_rematch(action,session_token,payload);end if;
 -- Reuse the current session and account gate before touching shared state.
 result:=nisfayn_test.rpc_before_rematch('state',session_token,'{}');
 who:=result->>'actor';
 select data into d from nisfayn_test.room where id for update;
 if action='close' then
  if not coalesce((d->>'matched')::boolean,false) and d->>'rematchRequestedBy' is null
   and coalesce(payload->'block','false')<>'true'::jsonb and coalesce(payload->'report','false')<>'true'::jsonb then return result;end if;
  if not coalesce((d->>'matched')::boolean,false) and d->>'rematchRequestedBy' is not null and d->>'rematchRequestedBy'<>who
   and coalesce(payload->'block','false')<>'true'::jsonb and coalesce(payload->'report','false')<>'true'::jsonb then
   raise exception 'يمكن للمرسل إلغاء الطلب.' using errcode='42501';end if;
  result:=nisfayn_test.rpc_before_rematch(action,session_token,payload);
  update nisfayn_test.room set data=(data-'rematchRequestedBy')||jsonb_build_object('allowRematch',
   coalesce(payload->'allowRematch','false')='true'::jsonb and coalesce(payload->'block','false')<>'true'::jsonb and coalesce(payload->'report','false')<>'true'::jsonb) where id returning data into d;
 elsif action='match_seen' then
  if payload->>'key'=d->>'matchCelebration' then
   d:=jsonb_set(d,'{celebrationSeen}',coalesce(d->'celebrationSeen','{}')||jsonb_build_object(who,payload->>'key'));
  end if;
 else
  perform 1 from marriage.admin_test_members where actor<>who and not paused and not suspended and review_status='approved' and access_until>now() for share;
  if not found then raise exception 'الطرف الآخر غير متاح حاليًا.' using errcode='42501';end if;
  if coalesce((d->>'matched')::boolean,false) or not coalesce((d->>'allowRematch')::boolean,false) then
   raise exception 'إعادة التعارف غير متاحة.' using errcode='42501';end if;
  if action='rematch_request' then
   if d->>'rematchRequestedBy' is null then d:=d||jsonb_build_object('rematchRequestedBy',who);end if;
  else
   if d->>'rematchRequestedBy' is null or d->>'rematchRequestedBy'=who then raise exception 'بانتظار قبول الطرف الآخر.' using errcode='42501';end if;
   d:=d-'rematchRequestedBy';
   if action='rematch_accept' then
    d:=d||jsonb_build_object('matched',true,'stage',0,'agree','{}'::jsonb,'exclusive',false,'exclusiveConsent','{}'::jsonb,
     'seriousness',jsonb_build_object('status','none'),'callPermission',jsonb_build_object('status','none'),'rewind',null,
     'matchedAt',now(),'matchCelebration',gen_random_uuid()::text,'celebrationSeen','{}'::jsonb);
   else d:=d||'{"allowRematch":false}'::jsonb;end if;
  end if;
 end if;
 update nisfayn_test.room set data=d where id;
 return d||jsonb_build_object('actor',who,'profileRevision',result->'profileRevision');
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
