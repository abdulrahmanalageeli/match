-- Private tester reactions use the same locked conversation document as messages.
-- Each actor owns exactly one choice; edge projection returns only counts/mine.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_message_reactions;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text; d jsonb; m jsonb; selected text; choices jsonb;
begin
 if action<>'message_react' then return nisfayn_test.rpc_before_message_reactions(action,session_token,payload);end if;
 select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
 if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
 perform 1 from marriage.admin_test_members where actor in('abdulrahman','reham') order by actor for share;
 if (select count(*) from marriage.admin_test_members where actor in('abdulrahman','reham')
  and not paused and not suspended and review_status='approved' and access_until>now())<>2 then
  raise exception 'الحساب أو الطرف الآخر غير متاح.' using errcode='42501';end if;
 select data into d from nisfayn_test.room where id for update;
 if not coalesce((d->>'matched')::boolean,false) then raise exception 'التعارف مغلق.' using errcode='42501';end if;
 if coalesce(d#>>'{seriousness,status}','none') not in('accepted','family') or
  d#>>'{seriousness,status}'='accepted' and not coalesce((d#>>'{seriousness,deadline}')::timestamptz>now(),false) then
  raise exception 'أكملا اتفاق الجدية والمدة قبل بدء التواصل.' using errcode='42501';end if;
 if jsonb_typeof(payload)<>'object' or not payload?'reaction' or jsonb_typeof(payload->'reaction') not in('null','string') then
  raise exception 'اختر تفاعلًا صالحًا.' using errcode='22023';end if;
 selected:=payload->>'reaction';
 if selected is not null and selected not in('❤️','😂','😮','😢','🙏','👍') then
  raise exception 'اختر تفاعلًا صالحًا.' using errcode='22023';end if;
 select value into m from jsonb_array_elements(d->'messages') where value->>'id'=payload->>'id';
 if m is null or m->>'deletedAt' is not null or exists(select 1 from nisfayn_test.message_deletions where id::text=m->>'id') then
  raise exception 'الرسالة غير متاحة.' using errcode='42501';end if;
 choices:=case when jsonb_typeof(m->'reactionBy')='object' then m->'reactionBy' else '{}'::jsonb end;
 choices:=choices-who;
 if selected is not null then choices:=choices||jsonb_build_object(who,selected);end if;
 update nisfayn_test.room set data=jsonb_set(d,'{messages}',
  (select jsonb_agg(case when item->>'id'=payload->>'id' then jsonb_set(item,'{reactionBy}',choices) else item end order by ord)
   from jsonb_array_elements(d->'messages') with ordinality rows(item,ord))) where id;
 return nisfayn_test.rpc_before_message_reactions('state',session_token,'{}');
end $$;
revoke all on function nisfayn_test.rpc_before_message_reactions(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;

create or replace function nisfayn_test.redact_room_messages() returns trigger language plpgsql security definer set search_path='' as $$begin
 new.data:=jsonb_set(new.data,'{messages}',coalesce((select jsonb_agg(
  case when message->>'deletedAt' is not null then message-'reactionBy' else message end order by ord)
  from jsonb_array_elements(nisfayn_test.chat_messages(new.data->'messages')) with ordinality rows(message,ord)),'[]'));
 return new;
end $$;
