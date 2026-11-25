-- Reuse the leased outbox and existing delivery worker for member updates.
alter table marriage.push_outbox add column update_target uuid;
alter table marriage.push_outbox drop constraint push_outbox_kind_check;
alter table marriage.push_outbox add check(kind in ('request','mutual','message','reminder','family','analysis','publication','update'));
do $$
declare c text;
begin
 select conname into strict c from pg_constraint
 where conrelid='marriage.push_outbox'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%publication_id IS NOT NULL%';
 execute format('alter table marriage.push_outbox drop constraint %I',c);
end $$;
alter table marriage.push_outbox add check(
 case when kind='publication' then publication_id is not null and request_id is null and update_target is null
 when kind='update' then publication_id is null and update_target is not null
 else request_id is not null and publication_id is null and update_target is null end);
alter table nisfayn_test.push_outbox drop constraint push_outbox_kind_check;
alter table nisfayn_test.push_outbox add check(kind in ('mutual','message','family','reminder','update'));

create table marriage.notification_updates (
 id uuid primary key default gen_random_uuid(),
 member_id uuid references marriage.members(id) on delete cascade,
 test_actor text references marriage.admin_test_members(actor) on delete cascade,
 request_id uuid references marriage.member_requests(id) on delete cascade,
 event_key text not null,
 target_id uuid not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 check ((member_id is null) <> (test_actor is null)),
 unique(member_id,event_key), unique(test_actor,event_key)
);
create index notification_updates_member on marriage.notification_updates(member_id,created_at desc) where member_id is not null;
create index notification_updates_tester on marriage.notification_updates(test_actor,created_at desc) where test_actor is not null;
create index notification_updates_retention on marriage.notification_updates(created_at);
alter table marriage.notification_updates enable row level security;
revoke all on marriage.notification_updates from public,anon,authenticated,service_role;

create function marriage.update_category(event text) returns text
language sql immutable strict set search_path='' as $$
 select case split_part(event,':',1)
 when 'agreement' then 'agreement' when 'journey' then 'agreement' when 'rematch' then 'agreement'
 when 'family_link' then 'family' when 'missed_call' then 'message' when 'analysis' then 'analysis'
 when 'interest' then 'interest' when 'screenshot' then 'screenshot'
 when 'application' then 'account' when 'verification' then 'account'
 when 'safety' then 'account' when 'support' then 'account'
 when 'membership' then 'membership' when 'gift' then 'membership' end
$$;

create or replace function marriage.check_push_controls(patch jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(patch) is distinct from 'object' then raise exception 'Invalid notification controls'; end if;
 for k,v in select key,value from jsonb_each(patch) loop
  if k in ('connections','message','family','reminder','analysis','sound','quiet','agreement','account','membership','interest','screenshot')
     and jsonb_typeof(v)='boolean' then continue; end if;
  if k in ('start','end') and v::text ~ '^([0-9]|1[0-9]|2[0-3])$' then continue; end if;
  if k='zone' and jsonb_typeof(v)='string' and length(v#>>'{}')<=64
    and exists(select 1 from pg_timezone_names where name=v#>>'{}') then continue; end if;
  raise exception 'Invalid notification control';
 end loop;
 return patch;
end $$;

create function marriage.update_enabled(controls jsonb,event text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((controls->>marriage.update_category(event))::boolean,marriage.update_category(event) not in ('screenshot','analysis'),false)
$$;

create function marriage.queue_member_update(member uuid,event text,target uuid,connection uuid default null)
returns void language sql set search_path='' as $$
 insert into marriage.notification_updates(member_id,request_id,event_key,target_id)
 select member,connection,event,target
 where split_part(event,':',1) not in ('interest','screenshot')
 on conflict(member_id,event_key) do nothing;
 insert into marriage.push_outbox(installation_id,member_id,request_id,kind,event_key,update_target,expires_at)
 select d.installation_id,d.member_id,connection,'update',event,target,now()+interval '1 hour'
 from marriage.push_devices d join marriage.push_preferences p using(member_id)
 where d.member_id=member and p.enabled and marriage.update_enabled(p.controls,event)
 on conflict(installation_id,event_key) do nothing
$$;

create function nisfayn_test.queue_member_update(recipient text,event text)
returns void language sql set search_path='' as $$
 insert into marriage.notification_updates(test_actor,event_key,target_id)
 select recipient,event,'00000000-0000-4000-8000-000000000001'::uuid
 where recipient is not null and split_part(event,':',1) not in ('interest','screenshot')
 on conflict(test_actor,event_key) do nothing;
 insert into nisfayn_test.push_outbox(installation_id,actor,kind,event_key,expires_at)
 select d.installation_id,d.actor,'update',event,now()+interval '1 hour'
 from nisfayn_test.push_devices d join nisfayn_test.push_preferences p using(actor)
 where d.actor=recipient and p.enabled and marriage.update_enabled(p.controls,event)
 on conflict(installation_id,event_key) do nothing
$$;

create function marriage.agreement_update(previous jsonb,current_state jsonb)
returns text[] language sql immutable set search_path='' as $$
 select case
  when current_state->>'status'='proposed' and current_state->>'proposalId' is distinct from previous->>'proposalId'
   then array['agreement:proposed:'||(current_state->>'proposalId'),'abdulrahman']
  when current_state->>'status'='accepted' and previous->>'status'='proposed'
   then array['agreement:signed:'||(current_state->>'proposalId'),'reham']
  when current_state->>'status'='accepted' and current_state#>>'{extension,id}' is not null
       and current_state#>>'{extension,id}' is distinct from previous#>>'{extension,id}'
   then array['agreement:extension:'||(current_state#>>'{extension,id}'),case current_state#>>'{extension,actor}' when 'reham' then 'abdulrahman' else 'reham' end]
  when current_state->>'status'='accepted' and previous#>>'{extension,id}' is not null
       and current_state->>'deadline' is distinct from previous->>'deadline'
   then array['agreement:extended:'||(previous#>>'{extension,id}'),previous#>>'{extension,actor}']
  when current_state->>'status'='accepted' and current_state->>'familyProposalId' is not null
       and current_state->>'familyProposalId' is distinct from previous->>'familyProposalId'
   then array['agreement:family_invited:'||(current_state->>'familyProposalId'),case current_state#>>'{familyAgreed,reham}' when 'true' then 'abdulrahman' else 'reham' end]
  when current_state->>'status'='family' and previous->>'status' is distinct from 'family'
   then array['agreement:family_confirmed:'||(current_state->>'familyProposalId'),case previous#>>'{familyAgreed,reham}' when 'true' then 'reham' else 'abdulrahman' end]
 end
$$;

create function marriage.enqueue_member_update() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=to_jsonb(old); event text; target uuid; member uuid; connection uuid; actor text; change text[];
begin
 case tg_table_name
 when 'conversation_agreements' then
  change:=marriage.agreement_update(o->'data',n->'data');
  event:=change[1]; connection:=new.request_id; target:=connection;
  if event is not null then
   select p.member_id into member from marriage.member_requests r
   join marriage.profiles p on p.member_id in(r.requester_id,r.recipient_id)
   where r.id=connection and r.status='accepted'
    and p.gender=case change[2] when 'reham' then 'woman' else 'man' end;
  end if;
 when 'room' then
  if new.data->>'matched'='true' then
   change:=marriage.agreement_update(o->'data'->'seriousness',n->'data'->'seriousness');
   if change[1] is not null then perform nisfayn_test.queue_member_update(change[2],change[1]); end if;
   if n#>>'{data,call,endReason}'='missed' and o#>>'{data,call,endReason}' is distinct from 'missed' then
    actor:=case n#>>'{data,call,caller}' when 'reham' then 'abdulrahman' when 'abdulrahman' then 'reham' end;
    perform nisfayn_test.queue_member_update(actor,'missed_call:received:'||(n#>>'{data,call,id}'));
   end if;
   if n#>>'{data,exclusiveId}' is not null and
      (n#>'{data,exclusiveConsent}' is distinct from o#>'{data,exclusiveConsent}') then
    actor:=case when n#>>'{data,exclusiveConsent,reham}'='true' and o#>>'{data,exclusiveConsent,reham}' is distinct from 'true' then 'abdulrahman'
                when n#>>'{data,exclusiveConsent,abdulrahman}'='true' and o#>>'{data,exclusiveConsent,abdulrahman}' is distinct from 'true' then 'reham' end;
    if actor is not null then
     perform nisfayn_test.queue_member_update(actor,'journey:'||case when n#>>'{data,exclusive}'='true' then 'confirmed:' else 'invited:' end||(n#>>'{data,exclusiveId}'));
    end if;
   end if;
   if n#>>'{data,stepId}' is not null and n#>'{data,agree}' is distinct from o#>'{data,agree}' then
    actor:=case when n#>>'{data,agree,reham}'='true' and o#>>'{data,agree,reham}' is distinct from 'true' then 'abdulrahman'
                when n#>>'{data,agree,abdulrahman}'='true' and o#>>'{data,agree,abdulrahman}' is distinct from 'true' then 'reham' end;
    if actor is not null then
     perform nisfayn_test.queue_member_update(actor,'journey:'||case when n#>>'{data,stage}' is distinct from o#>>'{data,stage}' then 'confirmed:' else 'invited:' end||(n#>>'{data,stepId}'));
    end if;
   end if;
  elsif n#>>'{data,rematchRequestedBy}' is not null and n#>>'{data,rematchRequestedBy}' is distinct from o#>>'{data,rematchRequestedBy}' then
   actor:=case n#>>'{data,rematchRequestedBy}' when 'reham' then 'abdulrahman' else 'reham' end;
   perform nisfayn_test.queue_member_update(actor,'rematch:invited:'||gen_random_uuid());
  end if;
  return null;
 when 'activity_notifications', 'notifications' then
  if n->>'kind' in ('interest','screenshot') then
   event:=(n->>'kind')||':received:'||(n->>'id');
   if tg_table_schema='nisfayn_test' then
    perform nisfayn_test.queue_member_update(n->>'recipient',event); return null;
   end if;
   member:=new.recipient_id; connection:=new.request_id;
   target:=coalesce(connection,new.actor_id);
  end if;
 when 'exclusive_consents', 'stage_choices' then
  connection:=new.request_id; target:=connection;
  select case new.member_id when r.requester_id then r.recipient_id else r.requester_id end
  into member from marriage.member_requests r where r.id=connection and r.status='accepted';
  if tg_table_name='exclusive_consents' then
   actor:=case when exists(select 1 from marriage.exclusive_consents c where c.request_id=connection and c.member_id=member) then 'confirmed' else 'invited' end;
  else
   actor:=case when exists(select 1 from marriage.stage_choices c where c.request_id=connection and c.stage=new.stage and c.member_id=member) then 'confirmed' else 'invited' end;
  end if;
  event:='journey:'||actor||':'||new.proposal_id;
 when 'family_links' then
  if tg_op='INSERT' and new.status='pending' then
   event:='family_link:pending:'||new.id;
  elsif new.status='active' and new.admin_review='approved' and
    (o->>'status' is distinct from 'active' or o->>'admin_review' is distinct from 'approved') then
   event:='family_link:active:'||new.id||':'||new.admin_revision;
  elsif new.admin_review is distinct from o->>'admin_review' and new.admin_review <> 'pending' then
   event:='family_link:reviewed:'||new.id||':'||new.admin_revision;
  end if;
  if event is not null then
   if new.test_actor is not null then
    perform nisfayn_test.queue_member_update(new.test_actor,event); return null;
   end if;
   member:=new.member_id; target:=new.id;
  end if;
 when 'voice_calls' then
  if n->>'end_reason'='missed' and o->>'end_reason' is distinct from 'missed' then
   member:=new.callee_id; connection:=new.request_id; target:=connection;
   event:='missed_call:received:'||new.id;
  end if;
 when 'members' then
  if n->>'review_status'='approved' and o->>'review_status' is distinct from 'approved' then
   member:=new.id; target:=new.id; event:='application:approved:'||gen_random_uuid();
  end if;
 when 'manual_verification_requests' then
  if n->>'status' in ('changes_requested','approved','rejected','revoked') and n->>'status' is distinct from o->>'status' then
   member:=new.member_id; target:=new.id; event:='verification:'||new.status||':'||new.id||':'||new.revision;
  end if;
 when 'deep_analyses' then
  if new.status='review' and old.status is distinct from 'review' then
   event:='analysis:review:'||new.id;
   perform marriage.queue_member_update(new.requester_id,event,new.connection_id,new.connection_id);
   perform marriage.queue_member_update(new.recipient_id,event,new.connection_id,new.connection_id);
  end if;
 when 'conduct_cases' then
  if tg_op='INSERT' or n->>'decision' is distinct from o->>'decision' then
   member:=new.member_id; target:=new.id; event:='safety:review:'||new.id||':'||new.revision;
  end if;
 when 'support_requests' then
  if n->>'remedial_step' is not null and n->>'remedial_at' is distinct from o->>'remedial_at' then
   member:=new.owner_id; target:=new.id; event:='application:corrections:'||new.id||':'||new.revision;
  elsif n->>'response' is not null and n->>'response' is distinct from o->>'response' then
   member:=new.owner_id; target:=new.id; event:='support:reply:'||new.id||':'||new.revision;
  end if;
 when 'membership_receipts' then
  if new.source<>'apple' and new.kind in ('grant','extend','end') and n is distinct from o then
   member:=new.member_id; target:=new.id;
   event:=case new.source when 'member' then 'gift:received:' else 'membership:'||new.kind||':' end||new.id||':'||extract(epoch from new.changed_at);
  end if;
 when 'gift_invitations' then
  member:=new.recipient; target:=new.id; event:='gift:invited:'||new.id;
 when 'subscription_owners' then
  if n->>'billing_retry'='true' and o->>'billing_retry' is distinct from 'true' then
   member:=new.member_id; target:=member; event:='membership:payment:'||gen_random_uuid();
  end if;
 end case;
 if member is not null and event is not null then
  perform marriage.queue_member_update(member,event,target,connection);
 end if;
 return null;
end $$;

create function marriage.read_notification_updates(owner uuid,actor text,read_id uuid) returns jsonb
language plpgsql set search_path='' as $$
begin
 if read_id is not null then
  update marriage.notification_updates u set read_at=coalesce(u.read_at,now())
  where u.id=read_id and (u.member_id=owner or u.test_actor=actor);
  return '[]'::jsonb;
 end if;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q."createdAt" desc) from (
  select u.id,split_part(u.event_key,':',1)||':'||split_part(u.event_key,':',2) as event,
   u.target_id as "target", u.created_at as "createdAt", u.read_at is null as unread
  from marriage.notification_updates u
  where (u.member_id=owner or u.test_actor=actor) and u.created_at>now()-interval '30 days'
  and (u.request_id is null or exists(select from marriage.member_requests r where r.id=u.request_id
    and r.status='accepted' and owner in(r.requester_id,r.recipient_id) and marriage.compatible(r.requester_id,r.recipient_id)))
  order by u.created_at desc,u.id desc limit 25
 ) q),'[]'::jsonb);
end $$;

create function public.marriage_push_updates(read_id uuid default null) returns jsonb
language sql security definer set search_path='' as $$
 select marriage.read_notification_updates(auth.uid(),null,$1)
$$;

create function public.marriage_support_ticket(ticket_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select marriage.support_summary(t) from marriage.support_requests t
 where t.id=$1 and t.owner_id=auth.uid()
$$;

create function public.nisfayn_test_push_updates(action text,session_token text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;
begin
 select s.actor into who from nisfayn_test.sessions s
 join marriage.admin_test_members m on m.actor=s.actor
 where s.token_hash=sha256(session_token::bytea) and s.expires_at>now() and not m.suspended and m.access_until>now();
 if who is null or action<>'push_updates' then raise exception 'Permission denied' using errcode='42501'; end if;
 return marriage.read_notification_updates(null,who,(payload->>'read_id')::uuid);
end $$;
revoke all on function marriage.read_notification_updates(uuid,text,uuid),public.marriage_push_updates(uuid),
 public.marriage_support_ticket(uuid),public.nisfayn_test_push_updates(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.marriage_push_updates(uuid),public.marriage_support_ticket(uuid) to authenticated;
grant execute on function public.nisfayn_test_push_updates(text,text,jsonb) to service_role;

create trigger agreement_alert after update of data on marriage.conversation_agreements for each row execute function marriage.enqueue_member_update();
create trigger pair_update_alert after update of data on nisfayn_test.room for each row execute function marriage.enqueue_member_update();
create trigger member_activity_alert after insert on marriage.activity_notifications for each row execute function marriage.enqueue_member_update();
create trigger tester_activity_alert after insert on nisfayn_test.notifications for each row execute function marriage.enqueue_member_update();
create trigger exclusive_alert after insert on marriage.exclusive_consents for each row execute function marriage.enqueue_member_update();
create trigger stage_alert after insert on marriage.stage_choices for each row execute function marriage.enqueue_member_update();
create trigger family_link_alert after insert or update of status,admin_review on marriage.family_links for each row execute function marriage.enqueue_member_update();
create trigger missed_call_alert after update of end_reason on marriage.voice_calls for each row execute function marriage.enqueue_member_update();
create trigger application_review_alert after update of review_status on marriage.members for each row execute function marriage.enqueue_member_update();
create trigger verification_alert after update of status on marriage.manual_verification_requests for each row execute function marriage.enqueue_member_update();
create trigger analysis_review_alert after update of status on marriage.deep_analyses for each row execute function marriage.enqueue_member_update();
create trigger conduct_alert after insert or update of decision on marriage.conduct_cases for each row execute function marriage.enqueue_member_update();
create trigger support_reply_alert after update of response,remedial_at on marriage.support_requests for each row execute function marriage.enqueue_member_update();
create trigger membership_receipt_alert after insert or update on marriage.membership_receipts for each row execute function marriage.enqueue_member_update();
create trigger gift_invite_alert after insert on marriage.gift_invitations for each row execute function marriage.enqueue_member_update();
create trigger billing_retry_alert after update of billing_retry on marriage.subscription_owners for each row execute function marriage.enqueue_member_update();

alter function public.nisfayn_enqueue_deadline_reminders() rename to nisfayn_enqueue_deadline_reminders_before_updates;
create function public.nisfayn_enqueue_deadline_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare r record; total integer;
begin
 total:=public.nisfayn_enqueue_deadline_reminders_before_updates();
 delete from marriage.notification_updates where created_at<now()-interval '30 days';
 for r in select a.request_id,c.requester_id,c.recipient_id,a.data->>'deadline' as deadline
  from marriage.conversation_agreements a join marriage.member_requests c on c.id=a.request_id
  where c.status='accepted' and a.data->>'status' in ('accepted','expired')
   and (a.data->>'deadline')::timestamptz between now()-interval '1 hour' and now()
 loop
  perform marriage.queue_member_update(r.requester_id,'agreement:expired:'||r.request_id||':'||r.deadline,r.request_id,r.request_id);
  perform marriage.queue_member_update(r.recipient_id,'agreement:expired:'||r.request_id||':'||r.deadline,r.request_id,r.request_id);
 end loop;
 for r in select data#>>'{seriousness,deadline}' as deadline from nisfayn_test.room where id and data->>'matched'='true'
  and data#>>'{seriousness,status}' in ('accepted','expired')
  and (data#>>'{seriousness,deadline}')::timestamptz between now()-interval '1 hour' and now()
 loop
  perform nisfayn_test.queue_member_update('abdulrahman','agreement:expired:'||r.deadline);
  perform nisfayn_test.queue_member_update('reham','agreement:expired:'||r.deadline);
 end loop;
 for r in select id,member_id,test_actor from marriage.family_link_invites
  where expires_at between now()-interval '1 hour' and now()
 loop
  if r.test_actor is null then perform marriage.queue_member_update(r.member_id,'family_link:expired:'||r.id,r.id);
  else perform nisfayn_test.queue_member_update(r.test_actor,'family_link:expired:'||r.id); end if;
 end loop;
 return total;
end $$;
revoke all on function public.nisfayn_enqueue_deadline_reminders_before_updates(),public.nisfayn_enqueue_deadline_reminders() from public,anon,authenticated,service_role;
grant execute on function public.nisfayn_enqueue_deadline_reminders() to service_role;

create function marriage.agreement_update_valid(event text,current_state jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(case split_part(event,':',2)
  when 'proposed' then current_state->>'status'='proposed' and current_state->>'proposalId'=split_part(event,':',3)
  when 'extension' then current_state->>'status'='accepted' and current_state#>>'{extension,id}'=split_part(event,':',3)
  when 'family_invited' then current_state->>'status'='accepted' and current_state->>'familyProposalId'=split_part(event,':',3)
  when 'family_confirmed' then current_state->>'status'='family' and current_state->>'familyProposalId'=split_part(event,':',3)
  when 'signed' then current_state->>'status' in ('accepted','family') and current_state->>'proposalId'=split_part(event,':',3)
  when 'extended' then current_state->>'status' in ('accepted','family')
  when 'expired' then current_state->>'status' in ('accepted','expired') and event like '%:'||(current_state->>'deadline')
  else false end,false)
$$;

alter function marriage.push_allowed(marriage.push_outbox) rename to push_allowed_before_updates;
create function marriage.push_allowed(job marriage.push_outbox) returns boolean
language plpgsql stable set search_path='' as $$
begin
 if job.kind<>'update' then return marriage.push_allowed_before_updates(job); end if;
 return exists(select from marriage.push_devices d join auth.sessions s on s.id=d.session_id and s.user_id=d.member_id
  join marriage.push_preferences p using(member_id)
  where d.installation_id=job.installation_id and d.member_id=job.member_id and p.enabled
   and (s.not_after is null or s.not_after>now()) and marriage.update_enabled(p.controls,job.event_key))
 and (job.request_id is null or exists(select from marriage.member_requests r
  where r.id=job.request_id and job.member_id in(r.requester_id,r.recipient_id) and r.status='accepted'
   and marriage.compatible(r.requester_id,r.recipient_id)))
 and (split_part(job.event_key,':',1) <> 'interest' or
  (marriage.compatible(job.member_id,job.update_target) and marriage.is_paid(job.member_id) and marriage.is_paid(job.update_target)))
 and (split_part(job.event_key,':',1) <> 'agreement' or exists(
  select from marriage.conversation_agreements a where a.request_id=job.request_id and marriage.agreement_update_valid(job.event_key,a.data)))
 and (split_part(job.event_key,':',1) <> 'analysis' or exists(
  select from marriage.deep_analyses a where a.id::text=split_part(job.event_key,':',3) and a.status='review' and a.expires_at>now()
   and (case when a.requester_id=job.member_id then a.a_decisions when a.recipient_id=job.member_id then a.b_decisions end) is null))
 and (split_part(job.event_key,':',1) not in ('screenshot','missed_call') or job.request_id is null or not exists(
  select from marriage.push_thread_mutes m where m.member_id=job.member_id and m.request_id=job.request_id));
end $$;

alter function nisfayn_test.push_allowed(nisfayn_test.push_outbox) rename to push_allowed_before_updates;
create function nisfayn_test.push_allowed(job nisfayn_test.push_outbox) returns boolean
language plpgsql stable set search_path='' as $$
declare base nisfayn_test.push_outbox:=job;
begin
 if job.kind<>'update' then return nisfayn_test.push_allowed_before_updates(job); end if;
 if not exists(select from nisfayn_test.push_preferences p where p.actor=job.actor and p.enabled
  and marriage.update_enabled(p.controls,job.event_key)) then return false; end if;
 base.kind:='mutual';
 if split_part(job.event_key,':',1)='agreement' and not exists(
  select from nisfayn_test.room where id and marriage.agreement_update_valid(job.event_key,data->'seriousness')) then return false; end if;
 if split_part(job.event_key,':',1) in ('rematch','family_link','interest') then
  return exists(select from nisfayn_test.push_devices d join nisfayn_test.sessions s on s.token_hash=d.session_hash
   where d.installation_id=job.installation_id and d.actor=job.actor and s.actor=d.actor and s.expires_at>now())
   and exists(select from marriage.admin_test_members a where a.actor=job.actor and not a.suspended
     and not a.paused and a.review_status='approved' and a.access_until>now());
 end if;
 return nisfayn_test.push_allowed_before_updates(base);
end $$;

alter function public.nisfayn_push_delivery(uuid,uuid,boolean,text) rename to nisfayn_push_delivery_before_updates;
create function public.nisfayn_push_delivery(job_id uuid,lease uuid,tester boolean,claimed_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k text; event text; target uuid; token text; mode text; controls jsonb; scope text; attempts integer; badge integer:=0; member uuid;
begin
 if tester then
  select o.kind,o.event_key,d.token,p.mode,s.controls,'tester:'||encode(d.session_hash,'hex')||':'||d.installation_id,o.attempts
  into k,event,token,mode,controls,scope,attempts
  from nisfayn_test.push_outbox o join nisfayn_test.push_devices d using(installation_id,actor)
  join nisfayn_test.push_preferences s using(actor) left join nisfayn_test.notification_privacy p using(actor) where o.id=job_id;
 else
  select o.kind,o.event_key,o.update_target,d.token,p.mode,s.controls,'member:'||o.member_id||':'||d.installation_id,o.attempts,o.member_id
  into k,event,target,token,mode,controls,scope,attempts,member
  from marriage.push_outbox o join marriage.push_devices d using(installation_id,member_id)
  join marriage.push_preferences s using(member_id) left join marriage.notification_privacy p using(member_id) where o.id=job_id;
 end if;
 if k is distinct from 'update' then
  return public.nisfayn_push_delivery_before_updates(job_id,lease,tester,claimed_token)||
   case when k='analysis' then jsonb_build_object('analysisPhase',(select split_part(event_key,':',2) from marriage.push_outbox where id=job_id)) else '{}'::jsonb end;
 end if;
 if tester then
  if not nisfayn_test.push_validate(job_id,lease) then return null; end if;
 else
  if not marriage.push_validate(job_id,lease) then return null; end if;
  badge:=marriage.member_unread_total(member);
 end if;
 if token is distinct from claimed_token then return '{"retry":true}'::jsonb; end if;
 return jsonb_build_object('preview',coalesce(mode,'private'),'badge',least(badge,999),
  'scope',encode(sha256(convert_to(scope,'UTF8')),'hex'),'target',target,
  'event',split_part(event,':',1)||':'||split_part(event,':',2),
  'passive',attempts>1 or marriage.push_quiet(controls,now()) or event like 'screenshot:%' or event like 'agreement:expired:%',
  'sound',coalesce((controls->>'sound')::boolean,true));
end $$;
revoke all on function marriage.update_category(text),marriage.update_enabled(jsonb,text),marriage.queue_member_update(uuid,text,uuid,uuid),
 nisfayn_test.queue_member_update(text,text),marriage.agreement_update(jsonb,jsonb),marriage.agreement_update_valid(text,jsonb),marriage.enqueue_member_update(),
 marriage.push_allowed(marriage.push_outbox),nisfayn_test.push_allowed(nisfayn_test.push_outbox),
 public.nisfayn_push_delivery_before_updates(uuid,uuid,boolean,text),public.nisfayn_push_delivery(uuid,uuid,boolean,text)
 from public,anon,authenticated,service_role;
grant execute on function public.nisfayn_push_delivery(uuid,uuid,boolean,text) to service_role;
