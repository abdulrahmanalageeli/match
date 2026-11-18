-- Ordinary alerts are opt-in. These preferences never affect authorization to read a chat.
alter table marriage.push_preferences add column controls jsonb not null default '{}';
alter table nisfayn_test.push_preferences add column controls jsonb not null default '{}';

create function marriage.check_push_controls(patch jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(patch) is distinct from 'object' then raise exception 'Invalid notification settings'; end if;
 for k,v in select * from jsonb_each(patch) loop
  if k in ('connections','message','family','reminder','analysis','sound','quiet') and jsonb_typeof(v)='boolean' then continue; end if;
  if k in ('start','end') and jsonb_typeof(v)='number' and v::text ~ '^([0-9]|1[0-9]|2[0-3])$' then continue; end if;
  if k='zone' and jsonb_typeof(v)='string' and exists(select from pg_catalog.pg_timezone_names where name=patch->>k) then continue; end if;
  raise exception 'Invalid notification setting: %',k;
 end loop;
 return patch;
end $$;
create function marriage.push_controls(patch jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); result jsonb;
begin
 if patch='{}' then return coalesce((select controls from marriage.push_preferences where member_id=me),'{}'); end if;
 insert into marriage.push_preferences(member_id,controls) values(me,marriage.check_push_controls(patch))
 on conflict(member_id) do update set controls=marriage.push_preferences.controls || excluded.controls
 returning controls into result;
 return result;
end $$;
create function public.marriage_push_controls(patch jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select marriage.push_controls($1)$$;
revoke all on function marriage.check_push_controls(jsonb),marriage.push_controls(jsonb),public.marriage_push_controls(jsonb) from public,anon,authenticated;
grant execute on function marriage.push_controls(jsonb),public.marriage_push_controls(jsonb) to authenticated;

alter table marriage.notification_privacy drop constraint notification_privacy_mode_check;
alter table marriage.notification_privacy add check(mode in ('private','event','name','content'));
alter table nisfayn_test.notification_privacy drop constraint notification_privacy_mode_check;
alter table nisfayn_test.notification_privacy add check(mode in ('private','event','name','content'));

create or replace function public.nisfayn_test_push(action text,session_token text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text; patch jsonb:=payload->'patch'; result jsonb;
begin
 if action<>'push_controls' then return nisfayn_test.push(action,session_token,payload); end if;
 perform nisfayn_test.push('push_settings',session_token,'{}');
 select actor into strict who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if patch='{}' then return coalesce((select controls from nisfayn_test.push_preferences where actor=who),'{}'); end if;
 insert into nisfayn_test.push_preferences(actor,controls) values(who,marriage.check_push_controls(patch))
 on conflict(actor) do update set controls=nisfayn_test.push_preferences.controls || excluded.controls returning controls into result;
 return result;
end $$;
revoke all on function public.nisfayn_test_push(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_push(text,text,jsonb) to service_role;

create function marriage.member_unread_total(me uuid) returns integer
language sql stable set search_path='' as $$
 select coalesce(sum(marriage.thread_unread(r.id,p.peer,s.through_created_at,s.through_id)),0)::integer
 from marriage.member_requests r
 cross join lateral (select case when r.requester_id=me then r.recipient_id else r.requester_id end peer) p
 left join marriage.thread_read_positions s on s.request_id=r.id and s.reader_id=me
 where r.status='accepted' and me in(r.requester_id,r.recipient_id) and marriage.relationship_eligible(me,p.peer)
$$;
revoke all on function marriage.member_unread_total(uuid) from public,anon,authenticated;
create or replace function marriage.unread_count() returns integer
language sql stable security definer set search_path='' as $$select marriage.member_unread_total(marriage.require_communication_member())$$;

alter table marriage.push_outbox drop constraint push_outbox_kind_check;
alter table marriage.push_outbox add check(kind in ('request','mutual','message','family','reminder','analysis'));
alter table nisfayn_test.push_outbox drop constraint push_outbox_kind_check;
alter table nisfayn_test.push_outbox add check(kind in ('mutual','message','family','reminder'));
alter table marriage.push_outbox alter column expires_at set default now()+interval '1 hour';
alter table nisfayn_test.push_outbox alter column expires_at set default now()+interval '1 hour';

create function marriage.enqueue_analysis_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status not in ('requested','shared') or (tg_op='UPDATE' and new.status=old.status) then return new; end if;
 insert into marriage.push_outbox(installation_id,member_id,request_id,kind,event_key)
 select d.installation_id,d.member_id,new.connection_id,'analysis','analysis:'||new.status||':'||new.id
 from marriage.push_devices d join marriage.push_preferences p using(member_id)
 where p.enabled and p.controls->'analysis'='true'::jsonb
 and (d.member_id=new.recipient_id or (new.status='shared' and d.member_id=new.requester_id))
 on conflict(installation_id,event_key) do nothing;
 return new;
end $$;
revoke all on function marriage.enqueue_analysis_push() from public,anon,authenticated;
create trigger deep_analysis_notification after insert or update of status on marriage.deep_analyses
for each row execute function marriage.enqueue_analysis_push();

-- Include the connection in both existing and future reminder keys.
update marriage.push_outbox set event_key='deadline:'||request_id||':'||substr(event_key,10)
where kind='reminder' and event_key like 'deadline:%';

create index member_push_burst on marriage.push_outbox(installation_id,request_id,kind,created_at,id)
 where kind in ('message','family');
create index tester_push_burst on nisfayn_test.push_outbox(installation_id,kind,created_at,id)
 where kind in ('message','family');

create function marriage.push_category_enabled(controls jsonb, kind text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce((controls->>case when kind in ('request','mutual') then 'connections' else kind end)::boolean, kind<>'analysis')
$$;
create function marriage.push_quiet(controls jsonb, stamp timestamptz) returns boolean
language sql stable set search_path='' as $$
 select coalesce((controls->>'quiet')::boolean,false) and
 case when first_hour<last_hour then hour>=first_hour and hour<last_hour
      else hour>=first_hour or hour<last_hour end
 from (select extract(hour from stamp at time zone coalesce(controls->>'zone','Asia/Riyadh')) as hour,
 coalesce((controls->>'start')::int,22) first_hour,coalesce((controls->>'end')::int,7) last_hour) h
$$;
revoke all on function marriage.push_category_enabled(jsonb,text),marriage.push_quiet(jsonb,timestamptz) from public,anon,authenticated;

create or replace function marriage.push_privacy(preview_mode text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 if preview_mode is not null then
  if preview_mode not in('private','event','name','content') then raise exception 'Invalid preview';end if;
  insert into marriage.notification_privacy values(me,preview_mode) on conflict(member_id) do update set mode=excluded.mode;
 end if;
 return jsonb_build_object('preview',coalesce((select mode from marriage.notification_privacy where member_id=me),'private'));
end $$;

create or replace function nisfayn_test.push(action text,session_token text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb;who text;mode text:=payload->>'preview_mode';
begin
 base:=nisfayn_test.push_before_native(case when action='push_privacy' then 'push_settings' else action end,session_token,payload);
 if action<>'push_privacy' then return base;end if;
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if mode is not null then
  if mode not in('private','event','name','content') then raise exception 'Invalid preview';end if;
  insert into nisfayn_test.notification_privacy values(who,mode) on conflict(actor) do update set mode=excluded.mode;
 end if;
 return jsonb_build_object('preview',coalesce((select p.mode from nisfayn_test.notification_privacy p where actor=who),'private'));
end $$;

create or replace function marriage.enqueue_push() returns trigger
language plpgsql security definer set search_path='' as $$
declare thread_id uuid; recipients uuid[]; event_kind text; event_id text; r marriage.member_requests;
begin
 if tg_table_name='thread_messages' then
  select * into strict r from marriage.member_requests where id=new.request_id;
  thread_id:=r.id; recipients:=array[case when new.sender_id=r.requester_id then r.recipient_id else r.requester_id end];
  event_kind:='message'; event_id:='message:'||new.id;
 else
  thread_id:=new.id;
  if tg_op='INSERT' and new.status='pending' then
   recipients:=array[new.recipient_id];event_kind:='request';event_id:='request:'||new.id;
  elsif tg_op='UPDATE' and old.status='pending' and new.status='accepted' then
   recipients:=array_remove(array[new.requester_id,new.recipient_id],auth.uid());event_kind:='mutual';event_id:='mutual:'||new.id;
  else return new; end if;
 end if;
 insert into marriage.push_outbox(installation_id,member_id,request_id,kind,event_key)
 select d.installation_id,d.member_id,thread_id,event_kind,event_id from marriage.push_devices d
 join marriage.push_preferences p on p.member_id=d.member_id and p.enabled
 where d.member_id=any(recipients)
 on conflict(installation_id,event_key) do nothing;
 return new;
end $$;

create or replace function marriage.push_allowed_before_reminders(job marriage.push_outbox) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.push_devices d
 join auth.sessions s on s.id=d.session_id and s.user_id=d.member_id
 join marriage.push_preferences p on p.member_id=d.member_id and p.enabled
 join marriage.member_requests r on r.id=job.request_id
 where d.installation_id=job.installation_id and d.member_id=job.member_id
 and (s.not_after is null or s.not_after>now())
 and job.member_id in(r.requester_id,r.recipient_id)

 and case when job.kind='request' then marriage.relationship_member_allowed(r.requester_id) and marriage.relationship_member_allowed(r.recipient_id)
          and marriage.compatible(r.requester_id,r.recipient_id) and r.status='pending' and r.recipient_id=job.member_id and r.created_at>now()-interval '7 days'
          else r.status='accepted' and marriage.relationship_eligible(r.requester_id,r.recipient_id) end
 -- A minute-delayed worker must not announce a message already read or deleted.
 and (job.kind<>'message' or exists(select 1 from marriage.thread_messages m
  left join marriage.thread_read_positions seen on seen.request_id=m.request_id and seen.reader_id=job.member_id
  where m.request_id=job.request_id and job.event_key='message:'||m.id::text and m.sender_id<>job.member_id and m.deleted_at is null
   and (m.created_at,m.id)>(coalesce(seen.through_created_at,'-infinity'::timestamptz),coalesce(seen.through_id,'00000000-0000-0000-0000-000000000000'::uuid)))))
$$;

create or replace function public.nisfayn_enqueue_deadline_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;m integer;
begin
 insert into marriage.push_outbox(installation_id,member_id,request_id,kind,event_key,expires_at)
 select d.installation_id,d.member_id,r.id,'reminder','deadline:'||r.id||':'||(a.data->>'deadline'),(a.data->>'deadline')::timestamptz
 from marriage.conversation_agreements a join marriage.member_requests r on r.id=a.request_id
 join marriage.push_devices d on d.member_id in(r.requester_id,r.recipient_id)
 join marriage.push_preferences p on p.member_id=d.member_id and p.enabled
 where r.status='accepted' and a.data->>'status'='accepted' and (a.data->>'deadline')::timestamptz>now()
 and (a.data->>'deadline')::timestamptz<=now()+interval '24 hours'
 on conflict(installation_id,event_key) do nothing;
 get diagnostics n=row_count;
 insert into nisfayn_test.push_outbox(installation_id,actor,kind,event_key,expires_at)
 select d.installation_id,d.actor,'reminder','deadline:'||(r.data#>>'{seriousness,deadline}'),(r.data#>>'{seriousness,deadline}')::timestamptz
 from nisfayn_test.room r cross join nisfayn_test.push_devices d join nisfayn_test.push_preferences p on p.actor=d.actor and p.enabled
 where (r.data->>'matched')::boolean and r.data#>>'{seriousness,status}'='accepted'
 and (r.data#>>'{seriousness,deadline}')::timestamptz>now() and (r.data#>>'{seriousness,deadline}')::timestamptz<=now()+interval '24 hours'
 on conflict(installation_id,event_key) do nothing;
 get diagnostics m=row_count;return n+m;
end $$;

create or replace function marriage.push_allowed(job marriage.push_outbox) returns boolean
language plpgsql stable set search_path='' as $$
declare base marriage.push_outbox:=job;
begin
 if not marriage.push_category_enabled((select controls from marriage.push_preferences where member_id=job.member_id),job.kind) then return false; end if;
 if job.kind='analysis' then
  base.kind:='mutual';
  return marriage.push_allowed_before_reminders(base) and exists(select from marriage.deep_analyses a
   where a.connection_id=job.request_id and job.event_key='analysis:'||a.status||':'||a.id
   and a.expires_at>now() and ((a.status='shared' and a.fingerprint=md5(jsonb_build_object('a',marriage.deep_evidence(a.requester_id),'b',marriage.deep_evidence(a.recipient_id))::text)) or (a.status='requested' and a.recipient_id=job.member_id)));
 end if;
 if job.kind='family' then base.kind:='mutual';return marriage.push_allowed_before_reminders(base) and marriage.family_push_valid(job.event_key,'member:'||job.member_id::text,job.request_id::text);end if;
 if job.kind<>'reminder' then return marriage.push_allowed_before_reminders(job);end if;
 base.kind:='mutual';
 return marriage.push_allowed_before_reminders(base) and exists(select 1 from marriage.conversation_agreements a
 where a.request_id=job.request_id and a.data->>'status'='accepted' and job.event_key='deadline:'||job.request_id||':'||(a.data->>'deadline')
 and (a.data->>'deadline')::timestamptz>now() and (a.data->>'deadline')::timestamptz<=now()+interval '24 hours');
end $$;

create or replace function public.nisfayn_push_content_before_family(job_id uuid,lease uuid,tester boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare j marriage.push_outbox;t nisfayn_test.push_outbox;d jsonb;m jsonb;msg marriage.thread_messages;
 mode text:='private';sender text;content text;mid text;badge integer:=0;peer uuid;
begin
 if tester then
  if not nisfayn_test.push_validate(job_id,lease) then return null;end if;
  select * into t from nisfayn_test.push_outbox where id=job_id;
  select data into d from nisfayn_test.room where id;
  select p.mode into mode from nisfayn_test.notification_privacy p where actor=t.actor;
  sender:=case when t.actor='reham' then 'عبدالرحمن' else 'رهام' end;
  select value into m from jsonb_array_elements(d->'messages') where value->>'id'=t.event_key;
  mid:=m->>'id';
  content:=case when m ? 'attachment' then case m#>>'{attachment,kind}' when 'audio' then 'رسالة صوتية' else 'صورة' end else left(m->>'body',160) end;
  select count(*)::integer into badge from jsonb_array_elements(d->'messages') v where v->>'sender'<>t.actor and v->>'deletedAt' is null
   and not exists(select 1 from nisfayn_test.message_deletions x where x.id::text=v->>'id')
   and (v->>'createdAt')::timestamptz>coalesce((d#>>array['read',t.actor])::timestamptz,'-infinity');
 else
  if not marriage.push_validate(job_id,lease) then return null;end if;
  select * into j from marriage.push_outbox where id=job_id;
  select case when r.requester_id=j.member_id then r.recipient_id else r.requester_id end into peer from marriage.member_requests r where r.id=j.request_id;
  select p.mode into mode from marriage.notification_privacy p where member_id=j.member_id;
  select p.display_name into sender from marriage.profiles p where member_id=peer;
  if j.kind='message' then
   select * into msg from marriage.thread_messages where id::text=replace(j.event_key,'message:','') and request_id=j.request_id;
   if msg.id is null or msg.deleted_at is not null then return null;end if;
   if exists(select 1 from marriage.thread_read_positions p where p.request_id=j.request_id and p.reader_id=j.member_id and (p.through_created_at,p.through_id)>=(msg.created_at,msg.id)) then return null;end if;
   mid:=msg.id::text;content:=left(msg.body,160);
  end if;
  badge:=marriage.member_unread_total(j.member_id);

 end if;
 return jsonb_strip_nulls(jsonb_build_object('preview',coalesce(mode,'private'),'sender',case when mode in('name','content') then left(sender,50) end,
 'body',case when mode='content' then content end,'messageId',mid,'badge',least(badge,999)));
end $$;

-- Recheck controls under the live lease. Only opaque, installation-specific routing
-- proof leaves the worker. Tester session credentials never enter an APNs payload.
alter function public.nisfayn_push_content(uuid,uuid,boolean) rename to nisfayn_push_content_with_family;
create function public.nisfayn_push_content(job_id uuid,lease uuid,tester boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare detail jsonb; controls jsonb; scope text; k text; burst boolean; attempt integer;
begin
 detail:=public.nisfayn_push_content_with_family(job_id,lease,tester);
 if detail is null then return null; end if;
 if tester then
  select p.controls,o.kind,o.attempts,'tester:'||encode(d.session_hash,'hex')||':'||d.installation_id,
   exists(select from nisfayn_test.push_outbox x where x.installation_id=o.installation_id and x.actor=o.actor and x.kind=o.kind
    and (x.created_at,x.id)<(o.created_at,o.id) and x.created_at>=o.created_at-interval '1 minute' and (x.outcome is null or x.outcome='sent'))
  into controls,k,attempt,scope,burst from nisfayn_test.push_outbox o join nisfayn_test.push_devices d using(installation_id,actor)
  join nisfayn_test.push_preferences p using(actor) where o.id=job_id;
 else
  select p.controls,o.kind,o.attempts,'member:'||o.member_id||':'||o.installation_id,
   exists(select from marriage.push_outbox x where x.installation_id=o.installation_id and x.member_id=o.member_id
    and x.request_id=o.request_id and x.kind=o.kind and (x.created_at,x.id)<(o.created_at,o.id)
    and x.created_at>=o.created_at-interval '1 minute' and (x.outcome is null or x.outcome='sent'))
  into controls,k,attempt,scope,burst from marriage.push_outbox o join marriage.push_preferences p using(member_id) where o.id=job_id;
 end if;
 if scope is null or not marriage.push_category_enabled(controls,k) then return null; end if;
 return detail || jsonb_build_object('scope',encode(sha256(convert_to(scope,'UTF8')),'hex'),
  'passive',k='reminder' or attempt>1 or marriage.push_quiet(controls,now()) or (k in ('message','family') and burst),
  'sound',coalesce((controls->>'sound')::boolean,true));
end $$;
revoke all on function public.nisfayn_push_content(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nisfayn_push_content(uuid,uuid,boolean) to service_role;

-- A device may rotate between claim and delivery. Retry under a fresh lease so
-- the worker never knowingly sends to a superseded address.
create function public.nisfayn_push_delivery(job_id uuid,lease uuid,tester boolean,claimed_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare current_token text; detail jsonb;
begin
 detail:=public.nisfayn_push_content(job_id,lease,tester);
 if detail is null then return null; end if;
 if tester then
  select d.token into current_token from nisfayn_test.push_outbox o join nisfayn_test.push_devices d using(installation_id,actor) where o.id=job_id;
 else
  select d.token into current_token from marriage.push_outbox o join marriage.push_devices d using(installation_id,member_id) where o.id=job_id;
 end if;
 if current_token is distinct from claimed_token then return '{"retry":true}'::jsonb; end if;
 return detail;
end $$;
revoke all on function public.nisfayn_push_delivery(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.nisfayn_push_delivery(uuid,uuid,boolean,text) to service_role;
