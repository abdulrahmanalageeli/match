-- A provider accepting a notification is not evidence of device delivery.
alter table marriage.thread_messages add column device_delivered_at timestamptz;
alter table marriage.push_outbox add column device_receipt uuid;
alter table nisfayn_test.push_outbox add column device_receipt uuid;
alter table marriage.push_outbox alter column device_receipt set default gen_random_uuid();
alter table nisfayn_test.push_outbox alter column device_receipt set default gen_random_uuid();

alter function marriage.chat_message_json(marriage.thread_messages,uuid) rename to chat_message_before_device_receipt;
create function marriage.chat_message_json(m marriage.thread_messages, viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select marriage.chat_message_before_device_receipt(m,viewer) || jsonb_build_object('deliveredAt',m.device_delivered_at)
$$;
revoke all on function marriage.chat_message_json(marriage.thread_messages,uuid) from public,anon,authenticated,service_role;

create function marriage.record_device_delivery(thread_id uuid, recipient uuid, message_ids uuid[]) returns void
language plpgsql set search_path='' as $$
declare peer uuid;
begin
 select case when requester_id=recipient then recipient_id else requester_id end into peer
 from marriage.member_requests where id=thread_id and status='accepted' and recipient in(requester_id,recipient_id);
 update marriage.thread_messages m set device_delivered_at=now()
 where m.request_id=thread_id and m.sender_id=peer and m.id=any(message_ids)
 and m.deleted_at is null and m.device_delivered_at is null;
 if found then
  begin perform realtime.send('{}','changed','marriage:member:'||peer::text,true);
  exception when others then raise log 'Delivery notification deferred (%)',sqlstate; end;
 end if;
end $$;
revoke all on function marriage.record_device_delivery(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;

create function marriage.confirm_thread_delivery(request_id uuid, message_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform marriage.chat_peer($1);
 perform marriage.require_communication_agreement($1);
 if cardinality($2)>100 then raise exception 'عدد الرسائل كبير.' using errcode='22023'; end if;
 perform marriage.record_device_delivery($1,auth.uid(),$2);
end $$;
create function public.marriage_confirm_thread_delivery(request_id uuid, message_ids uuid[]) returns void
language sql security invoker set search_path='' as $$select marriage.confirm_thread_delivery($1,$2)$$;
revoke all on function marriage.confirm_thread_delivery(uuid,uuid[]),public.marriage_confirm_thread_delivery(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function marriage.confirm_thread_delivery(uuid,uuid[]),public.marriage_confirm_thread_delivery(uuid,uuid[]) to authenticated;

-- Only the worker about to send to the validated installation receives this proof.
create or replace function public.nisfayn_push_delivery(job_id uuid,lease uuid,tester boolean,claimed_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare current_token text; detail jsonb; proof uuid;
begin
 detail:=public.nisfayn_push_content(job_id,lease,tester);
 if detail is null then return null; end if;
 if tester then
  select d.token,case when o.kind='message' then o.device_receipt end into current_token,proof
  from nisfayn_test.push_outbox o join nisfayn_test.push_devices d using(installation_id,actor) where o.id=job_id;
 else
  select d.token,case when o.kind='message' and d.environment in('sandbox','production') then o.device_receipt end into current_token,proof
  from marriage.push_outbox o join marriage.push_devices d using(installation_id,member_id) where o.id=job_id;
 end if;
 if current_token is distinct from claimed_token then return '{"retry":true}'::jsonb; end if;
 if proof is not null then detail:=detail||jsonb_build_object('receipt',jsonb_build_object('job',job_id,'proof',proof)); end if;
 return detail;
end $$;

-- The extension has no member session. The opaque proof authorizes one operation
-- on one message for one installation until its original alert deadline.
create function marriage.confirm_notification(job_id uuid, proof uuid) returns void
language plpgsql security definer set search_path='' as $$
declare member_job marriage.push_outbox; tester_job nisfayn_test.push_outbox; room_data jsonb; message_index bigint;
begin
 select * into member_job from marriage.push_outbox o where o.id=$1 and o.device_receipt=$2
 and o.kind='message' and o.expires_at>now() and o.attempts>0 and (o.outcome is null or o.outcome='sent');
 if found then
  if marriage.push_allowed(member_job) then
   perform marriage.record_device_delivery(member_job.request_id,member_job.member_id,array[substr(member_job.event_key,9)::uuid]);
  end if;
  return;
 end if;
 select * into tester_job from nisfayn_test.push_outbox o where o.id=$1 and o.device_receipt=$2
 and o.kind='message' and o.expires_at>now() and o.attempts>0 and (o.outcome is null or o.outcome='sent');
 if not found then return; end if;
 select data into room_data from nisfayn_test.room where id for update;
 if not nisfayn_test.push_allowed(tester_job) then return; end if;
 select i-1 into message_index from jsonb_array_elements(room_data->'messages') with ordinality as messages(m,i)
 where m->>'id'=tester_job.event_key and m->>'sender'<>tester_job.actor
 and m->>'deliveredAt' is null and m->>'deletedAt' is null;
 if found then
  update nisfayn_test.room set data=jsonb_set(data,array['messages',message_index::text,'deliveredAt'],to_jsonb(now())) where id;
 end if;
end $$;
create function public.wudayn_confirm_notification(job_id uuid,proof uuid) returns void
language sql security invoker set search_path='' as $$select marriage.confirm_notification($1,$2)$$;
revoke all on function marriage.confirm_notification(uuid,uuid),public.wudayn_confirm_notification(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function marriage.confirm_notification(uuid,uuid),public.wudayn_confirm_notification(uuid,uuid) to anon;
