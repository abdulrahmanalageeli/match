-- Chat navigation only returns messages already authorized by the existing
-- accepted-connection gate. No draft content is ever stored or broadcast.
-- Bound the result before aggregating, keeping the same stable page cursor as
-- the message timeline. Search input is treated as literal text, not a pattern.
create function marriage.search_messages(request_id uuid,search_query text default '',before_id uuid default null,media_kind text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();boundary timestamptz;q text:=btrim(coalesce(search_query,''));begin
 perform marriage.chat_peer($1);
 if char_length(q)>100 or media_kind is not null and media_kind not in('photo','audio') then raise exception 'خيارات البحث غير صالحة.' using errcode='22023';end if;
 if before_id is not null then select m.created_at into boundary from marriage.thread_messages m where m.request_id=$1 and m.id=$3;
  if not found then return '[]';end if;end if;
 return coalesce((select jsonb_agg(hit.payload order by hit.created_at,hit.id) from (
  select m.id,m.created_at,p.payload from marriage.thread_messages m
  cross join lateral(select marriage.chat_message_json(m,me) payload)p
  where m.request_id=$1 and m.deleted_at is null and ($3 is null or (m.created_at,m.id)<(boundary,$3))
   and (q='' or strpos(lower(m.body),lower(q))>0)
   and not coalesce((p.payload#>>'{attachment,viewOnce}')::boolean,false)
   and (q<>'' or jsonb_typeof(p.payload->'attachment')='object')
   and ($4 is null or p.payload#>>'{attachment,kind}'=$4)
  order by m.created_at desc,m.id desc limit 50
 ) hit),'[]'::jsonb);
end $$;
create function public.marriage_search_messages(request_id uuid,search_query text default '',before_id uuid default null,media_kind text default null) returns jsonb
language sql stable security invoker set search_path='' as $$select marriage.search_messages($1,$2,$3,$4)$$;

create function marriage.thread_read_state(request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();peer uuid;seen marriage.thread_read_positions;begin
 peer:=marriage.chat_peer($1);
 select * into seen from marriage.thread_read_positions r where r.request_id=$1 and r.reader_id=me;
 return (select jsonb_build_object('firstUnreadId',(array_agg(m.id order by m.created_at,m.id))[1],'unreadCount',count(*))
  from marriage.thread_messages m where m.request_id=$1 and m.sender_id=peer and m.deleted_at is null and (m.created_at,m.id)>
   (coalesce(seen.through_created_at,'-infinity'::timestamptz),coalesce(seen.through_id,'00000000-0000-0000-0000-000000000000'::uuid)));
end $$;
create function public.marriage_thread_read_state(request_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select marriage.thread_read_state($1)$$;
create or replace function marriage.thread_unread(request_key uuid,peer_id uuid,seen_at timestamptz,seen_id uuid)
returns integer language sql stable set search_path='' as $$
 select count(*)::integer from marriage.thread_messages m where m.request_id=$1 and m.sender_id=$2 and m.deleted_at is null
  and (m.created_at,m.id)>(coalesce($3,'-infinity'::timestamptz),coalesce($4,'00000000-0000-0000-0000-000000000000'::uuid))
$$;

create table marriage.chat_typing (
 request_id uuid not null references marriage.member_requests(id) on delete cascade,
 member_id uuid not null references marriage.members(id) on delete cascade,
 expires_at timestamptz not null,primary key(request_id,member_id)
);
create index chat_typing_member on marriage.chat_typing(member_id);
alter table marriage.chat_typing enable row level security;
revoke all on marriage.chat_typing from public,anon,authenticated,service_role;
create function marriage.typing_state(request_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$declare peer uuid;begin
 peer:=marriage.chat_peer($1);
 return exists(select 1 from marriage.chat_typing t where t.request_id=$1 and t.member_id=peer and t.expires_at>now());
end $$;
create function marriage.set_typing(request_id uuid,active boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member();peer uuid;was_active boolean;stamp timestamptz:=clock_timestamp();begin
 perform 1 from marriage.member_requests r where r.id=$1 and me in(r.requester_id,r.recipient_id) for share;
 peer:=marriage.chat_peer($1);
 if active is null then raise exception 'حالة الكتابة غير صالحة.' using errcode='22023';end if;
 select coalesce(expires_at>stamp,false) into was_active from marriage.chat_typing t where t.request_id=$1 and t.member_id=me for update;
 insert into marriage.chat_typing(request_id,member_id,expires_at) values($1,me,case when active then stamp+interval '6 seconds' else stamp end)
 on conflict on constraint chat_typing_pkey do update set expires_at=excluded.expires_at;
 if coalesce(was_active,false) is distinct from active then
  begin perform realtime.send('{}'::jsonb,'changed','marriage:member:'||peer::text,true);
  exception when others then raise log 'Nisfayn typing signal deferred (SQLSTATE %)',sqlstate;end;
 end if;return true;
end $$;
create function public.marriage_typing_state(request_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$select marriage.typing_state($1)$$;
create function public.marriage_set_typing(request_id uuid,active boolean) returns boolean
language sql security invoker set search_path='' as $$select marriage.set_typing($1,$2)$$;
revoke all on function marriage.search_messages(uuid,text,uuid,text),public.marriage_search_messages(uuid,text,uuid,text),
 marriage.thread_read_state(uuid),public.marriage_thread_read_state(uuid),marriage.typing_state(uuid),public.marriage_typing_state(uuid),
 marriage.set_typing(uuid,boolean),public.marriage_set_typing(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function marriage.search_messages(uuid,text,uuid,text),public.marriage_search_messages(uuid,text,uuid,text),
 marriage.thread_read_state(uuid),public.marriage_thread_read_state(uuid),marriage.typing_state(uuid),public.marriage_typing_state(uuid),
 marriage.set_typing(uuid,boolean),public.marriage_set_typing(uuid,boolean) to authenticated;

create table nisfayn_test.chat_typing(actor text primary key check(actor in('abdulrahman','reham')),expires_at timestamptz not null);
alter table nisfayn_test.chat_typing enable row level security;
revoke all on nisfayn_test.chat_typing from public,anon,authenticated,service_role;
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_typing;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;peer text;d jsonb;active boolean;begin
 if action not in('typing_set','typing_state') then return nisfayn_test.rpc_before_typing(action,session_token,payload);end if;
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
 perform 1 from marriage.admin_test_members where actor in('abdulrahman','reham') order by actor for share;
 if (select count(*) from marriage.admin_test_members where actor in('abdulrahman','reham') and not paused and not suspended and review_status='approved' and access_until>now())<>2 then raise exception 'الحساب أو الطرف الآخر غير متاح.' using errcode='42501';end if;
 select data into d from nisfayn_test.room where id for share;
 if not coalesce((d->>'matched')::boolean,false) then raise exception 'التعارف مغلق.' using errcode='42501';end if;
 if coalesce(d#>>'{seriousness,status}','none') not in('accepted','family') or d#>>'{seriousness,status}'='accepted' and not coalesce((d#>>'{seriousness,deadline}')::timestamptz>now(),false) then raise exception 'أكملا اتفاق الجدية والمدة قبل بدء التواصل.' using errcode='42501';end if;
 peer:=case when who='abdulrahman' then 'reham' else 'abdulrahman' end;
 if action='typing_state' then return to_jsonb(exists(select 1 from nisfayn_test.chat_typing where actor=peer and expires_at>now()));end if;
 if jsonb_typeof(payload->'active') is distinct from 'boolean' then raise exception 'حالة الكتابة غير صالحة.' using errcode='22023';end if;
 active:=(payload->>'active')::boolean;
 insert into nisfayn_test.chat_typing(actor,expires_at) values(who,clock_timestamp()+case when active then interval '6 seconds' else interval '0 seconds' end)
 on conflict(actor) do update set expires_at=excluded.expires_at;
 return 'true'::jsonb;
end $$;
revoke all on function nisfayn_test.rpc_before_typing(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
