-- Both test participants sign the same seriousness proposal before interacting.
-- History is preserved, and no production member or BlindMatch data is touched.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_interactions_v1;
revoke all on function nisfayn_test.rpc_interactions_v1(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor text; d jsonb; agreement jsonb; days integer;
begin
 if action in('attempt','login','logout') then return nisfayn_test.rpc_interactions_v1(action,session_token,payload);end if;
 select s.actor into v_actor from nisfayn_test.sessions s where s.token_hash=sha256(session_token::bytea) and s.expires_at>now();
 if v_actor is null then raise exception 'انتهت جلسة الاختبار. سجّل الدخول مجددًا.' using errcode='42501';end if;
 select data into d from nisfayn_test.room where id for update;
 agreement:=coalesce(d->'seriousness','{"status":"none"}'::jsonb);
 if agreement->>'status'='accepted' and (agreement->>'deadline')::timestamptz<=now() then
  agreement:=agreement||'{"status":"expired"}'::jsonb;
  if d#>>'{call,status}' in('ringing','active') then
   d:=jsonb_set(d,'{call}',(d->'call')||jsonb_build_object('status','ended','endedAt',now(),'endReason','unavailable'));
  end if;
 end if;
 if action in('send','media_reserve','media_publish','call_start','call_accept','token') and agreement->>'status' not in('accepted','family') then
  raise exception 'أكملا اتفاق الجدية والمدة قبل بدء التواصل.' using errcode='42501';
 end if;
 if action in('agreement_propose','agreement_accept','agreement_family') then
  if not (d->>'matched')::boolean then raise exception 'التعارف مغلق.' using errcode='42501';end if;
  if action='agreement_propose' then
   if v_actor<>'reham' or agreement->>'status' not in('none','proposed') or payload->'signed' is distinct from 'true'::jsonb then raise exception 'لا يمكن تقديم الاتفاق الآن.' using errcode='42501';end if;
   days:=(payload->>'days')::integer;
   if days is null or days not between 3 and 90 then raise exception 'اختاري مدة بين ٣ و٩٠ يومًا.';end if;
   agreement:=jsonb_build_object('status','proposed','proposalId',gen_random_uuid(),'days',days,'version','2026-11-06-v1','proposedAt',now(),'womanSignedAt',now(),'familyAgreed','{}'::jsonb);
  elsif action='agreement_accept' then
   if v_actor<>'abdulrahman' or agreement->>'status'<>'proposed' or agreement->>'proposalId' is distinct from payload->>'proposalId' or payload->'signed' is distinct from 'true'::jsonb then raise exception 'راجِع الاتفاق الحالي ووقّع عليه أولًا.' using errcode='42501';end if;
   agreement:=agreement||jsonb_build_object('status','accepted','manSignedAt',now(),'deadline',now()+make_interval(days=>(agreement->>'days')::integer));
  elsif action='agreement_family' then
   if agreement->>'status' not in('accepted','expired','family') or payload->'confirmed' is distinct from 'true'::jsonb then raise exception 'تأكيد الخطوة العائلية غير متاح الآن.' using errcode='42501';end if;
   agreement:=jsonb_set(agreement,'{familyAgreed}',coalesce(agreement->'familyAgreed','{}'));
   agreement:=jsonb_set(agreement,array['familyAgreed',v_actor],'true');
   if agreement#>>'{familyAgreed,reham}'='true' and agreement#>>'{familyAgreed,abdulrahman}'='true' then agreement:=agreement||jsonb_build_object('status','family','familyConfirmedAt',now());end if;
  end if;
 elsif action='reset' then
  if v_actor<>'abdulrahman' then raise exception 'غير مسموح.' using errcode='42501';end if;
  agreement:='{"status":"none"}'::jsonb;
  if d#>>'{call,status}' in('ringing','active') then
   d:=jsonb_set(d,'{call}',(d->'call')||jsonb_build_object('status','ended','endedAt',now(),'endReason','unavailable'));
  end if;
 end if;
 d:=jsonb_set(d,'{seriousness}',agreement);
 update nisfayn_test.room set data=d where id;
 if action in('agreement_propose','agreement_accept','agreement_family') then return d||jsonb_build_object('actor',v_actor);end if;
 return nisfayn_test.rpc_interactions_v1(action,session_token,payload);
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
