-- Explicit lock-screen preferences at onboarding and member-controlled chat mute.

create table marriage.push_thread_mutes (
  member_id uuid not null references marriage.members(id) on delete cascade,
  request_id uuid not null references marriage.member_requests(id) on delete cascade,
  muted_at timestamptz not null default now(),
  primary key(member_id,request_id)
);
alter table marriage.push_thread_mutes enable row level security;
revoke all on marriage.push_thread_mutes from public,anon,authenticated,service_role;

create or replace function marriage.push_privacy(preview_mode text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if preview_mode is not null then
  if preview_mode not in('private','event','name','content') then raise exception 'Invalid preview';end if;
  insert into marriage.notification_privacy values(me,preview_mode)
  on conflict(member_id) do update set mode=excluded.mode;
 end if;
 return jsonb_build_object(
  'preview',coalesce((select mode from marriage.notification_privacy where member_id=me),'private'),
  'configured',exists(select 1 from marriage.notification_privacy where member_id=me)
 );
end $$;

create function marriage.push_thread_mute(target_request uuid, muted boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 perform marriage.chat_peer(target_request);
 if muted is true then
  insert into marriage.push_thread_mutes(member_id,request_id) values(me,target_request)
  on conflict(member_id,request_id) do update set muted_at=now();
  update marriage.push_outbox set finished_at=now(),outcome='revoked',lease_id=null,lease_until=null
   where member_id=me and push_outbox.request_id=target_request
   and kind='message' and finished_at is null;
 elsif muted is false then
  delete from marriage.push_thread_mutes m where m.member_id=me and m.request_id=target_request;
 end if;
 return jsonb_build_object('muted',exists(
  select 1 from marriage.push_thread_mutes m where m.member_id=me and m.request_id=target_request
 ));
end $$;

create function public.marriage_push_thread_mute(request_id uuid, muted boolean default null) returns jsonb
language sql security invoker set search_path='' as $$select marriage.push_thread_mute($1,$2)$$;

alter function marriage.push_allowed(marriage.push_outbox) rename to push_allowed_before_thread_mutes;
create function marriage.push_allowed(job marriage.push_outbox) returns boolean
language plpgsql stable set search_path='' as $$
begin
 if job.kind='message' and exists(
  select 1 from marriage.push_thread_mutes m where m.member_id=job.member_id and m.request_id=job.request_id
 ) then return false; end if;
 return marriage.push_allowed_before_thread_mutes(job);
end $$;

revoke all on function marriage.push_privacy(text),marriage.push_thread_mute(uuid,boolean),public.marriage_push_thread_mute(uuid,boolean),marriage.push_allowed_before_thread_mutes(marriage.push_outbox),marriage.push_allowed(marriage.push_outbox) from public,anon,authenticated,service_role;
grant execute on function marriage.push_privacy(text),marriage.push_thread_mute(uuid,boolean),public.marriage_push_thread_mute(uuid,boolean) to authenticated;
