-- Account controls and media landed concurrently. Keep both gates regardless of migration ordering.
alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_gallery_account_gate;
revoke all on function nisfayn_test.rpc_before_gallery_account_gate(text,text,jsonb) from public,anon,authenticated,service_role;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;target text;begin
 if action in('rewind','gallery_list','gallery_url','gallery_prepare','gallery_commit','gallery_remove') then
  select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
  if who is null then raise exception 'انتهت جلسة الاختبار.' using errcode='42501';end if;
  perform 1 from marriage.admin_test_members where actor=who and not paused and not suspended and review_status='approved' and access_until>now() for share;
  if not found then raise exception 'الحساب غير متاح حاليًا. راجع الإدارة.' using errcode='42501';end if;
  target:=who;
  if action='rewind' then target:=case when who='reham' then 'abdulrahman' else 'reham' end;
  elsif action='gallery_list' then target:=coalesce(payload->>'subject',who);
  elsif action='gallery_url' then select actor into target from nisfayn_test.profile_gallery where id=(payload->>'id')::uuid;end if;
  if target is distinct from who then
   perform 1 from marriage.admin_test_members where actor=target and not paused and not suspended and review_status='approved' and access_until>now() for share;
   if not found then raise exception 'الطرف الآخر غير متاح حاليًا.' using errcode='42501';end if;
  end if;
 end if;
 return nisfayn_test.rpc_before_gallery_account_gate(action,session_token,payload);
end $$;
revoke all on function public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
