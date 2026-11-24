-- The installed app reports UIKit events. Authentication establishes the actor,
-- not hardware attestation. Neither API accepts a sender, recipient, text or photo.
alter table marriage.activity_notifications drop constraint activity_notifications_kind_check;
alter table marriage.activity_notifications add constraint activity_notifications_kind_check
  check (kind in ('profile_visit','exclusive','interest','screenshot'));

create function marriage.chat_screenshot(request_id uuid, event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
  me uuid := auth.uid();
  peer uuid;
  capture_key text;
begin
  if $2 is null then raise exception 'معرّف اللقطة مطلوب.'; end if;
  perform 1 from marriage.member_requests r
    where r.id=$1 and r.status='accepted' and me in (r.requester_id,r.recipient_id) for update;
  peer := marriage.chat_peer($1);
  capture_key := 'screenshot:' || $1 || ':' || me || ':' || $2;
  if exists (select 1 from marriage.activity_notifications n where n.recipient_id=peer and n.event_key=capture_key) then return; end if;
  if (select count(*) from marriage.activity_notifications n where n.recipient_id=peer and n.actor_id=me
      and n.kind='screenshot' and n.created_at > now()-interval '1 minute') >= 12 then
    raise exception 'محاولات كثيرة. حاول بعد دقيقة.';
  end if;
  insert into marriage.activity_notifications(recipient_id,actor_id,request_id,kind,event_key)
    values(peer,me,$1,'screenshot',capture_key);
  begin perform realtime.send('{}','changed','marriage:member:'||peer::text,true); exception when others then null; end;
end $$;
create function public.marriage_chat_screenshot(request_id uuid,event_id uuid) returns void
language sql security invoker set search_path='' as $$select marriage.chat_screenshot($1,$2)$$;
revoke all on function public.marriage_chat_screenshot(uuid,uuid),marriage.chat_screenshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.marriage_chat_screenshot(uuid,uuid),marriage.chat_screenshot(uuid,uuid) to authenticated;

create function public.nisfayn_test_chat_screenshot(session_token text,event_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
  who text;
  peer text;
  state jsonb;
  capture_key text;
begin
  if $2 is null then raise exception 'معرّف اللقطة مطلوب.'; end if;
  perform 1 from nisfayn_test.room where id for update;
  state := public.nisfayn_test_rpc('state',$1,'{}');
  who := state->>'actor';
  if who is null or who not in ('reham','abdulrahman') or state->'matched' is distinct from 'true'::jsonb then
    raise exception 'المحادثة غير متاحة.' using errcode='42501';
  end if;
  peer := case who when 'reham' then 'abdulrahman' else 'reham' end;
  capture_key := 'screenshot:'||who||':'||$2;
  if exists(select 1 from nisfayn_test.notifications n where n.recipient=peer and n.event_key=capture_key) then return; end if;
  if (select count(*) from nisfayn_test.notifications n where n.recipient=peer and n.actor=who
      and n.kind='screenshot' and n.created_at > now()-interval '1 minute') >= 12 then
    raise exception 'محاولات كثيرة. حاول بعد دقيقة.';
  end if;
  insert into nisfayn_test.notifications(recipient,actor,kind,event_key) values(peer,who,'screenshot',capture_key);
  update nisfayn_test.room set data=jsonb_set(data,'{captureRevision}',to_jsonb($2)) where id;
end $$;
revoke all on function public.nisfayn_test_chat_screenshot(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nisfayn_test_chat_screenshot(text,uuid) to service_role;
