-- Keep privileged implementation outside the exposed API schema.
alter function public.marriage_notifications() set schema marriage;
alter function marriage.marriage_notifications() rename to notifications;
alter function public.marriage_notifications_read(uuid[]) set schema marriage;
alter function marriage.marriage_notifications_read(uuid[]) rename to notifications_read;
create function public.marriage_notifications() returns jsonb language sql stable security invoker set search_path='' as $$select marriage.notifications()$$;
create function public.marriage_notifications_read(notification_ids uuid[]) returns void language sql security invoker set search_path='' as $$select marriage.notifications_read($1)$$;
revoke all on function marriage.notifications(),marriage.notifications_read(uuid[]),public.marriage_notifications(),public.marriage_notifications_read(uuid[]) from public,anon,authenticated;
grant execute on function marriage.notifications(),marriage.notifications_read(uuid[]),public.marriage_notifications(),public.marriage_notifications_read(uuid[]) to authenticated;

create or replace function marriage.note_profile_open(candidate_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();
begin
 if $1=me or not marriage.compatible(me,$1) or not marriage.is_paid($1) then return; end if;
 if not exists(select 1 from marriage.fit_observations o where o.viewer_id=me and o.candidate_id=$1)
  and not exists(select 1 from marriage.member_requests where status='accepted' and me in(requester_id,recipient_id) and $1 in(requester_id,recipient_id)) then return; end if;
 update marriage.fit_observations o set opened_at=coalesce(o.opened_at,now()) where o.viewer_id=me and o.candidate_id=$1 and o.offer_week=marriage.current_week();
 insert into marriage.activity_notifications(recipient_id,actor_id,kind,event_key) values($1,me,'profile_visit','visit:'||me::text||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD')) on conflict do nothing;
 begin perform realtime.send('{}'::jsonb,'changed','marriage:member:'||$1::text,true); exception when others then null; end;
end $$;
