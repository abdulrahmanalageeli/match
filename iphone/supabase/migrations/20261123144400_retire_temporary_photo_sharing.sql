-- Retire only the temporary portrait-sharing bucket. Chat attachments,
-- view-once messages, verified portraits and the profile gallery have separate storage.
drop policy nisfayn_photo_read on storage.objects;
drop policy nisfayn_photo_upload on storage.objects;
drop policy nisfayn_photo_delete on storage.objects;

revoke execute on function public.marriage_photo_state(uuid), public.marriage_photo_prepare(),
 public.marriage_photo_commit(uuid), public.marriage_photo_remove(), public.marriage_photo_share(uuid,boolean),
 public.marriage_revoke_my_photo_share(uuid), marriage.revoke_my_photo_share(uuid), marriage.photo_state(uuid),
 marriage.photo_prepare(), marriage.photo_commit(uuid), marriage.photo_remove(), marriage.photo_share(uuid,boolean),
 marriage.photo_can_read(text), marriage.photo_can_upload(text), marriage.photo_owns_path(text)
 from public,anon,authenticated;

-- The existing before-delete trigger queues the bytes for the Storage worker
-- and wakes old viewers. Keep the worker and its queue until deletion completes.
delete from marriage.photo_assets;
insert into marriage.photo_cleanup(object_path)
 select name from storage.objects where bucket_id='nisfayn-private-photos' on conflict do nothing;

do $migration$
declare
 definition text;
 original text;
begin
 definition:=replace(pg_get_functiondef('marriage.ops_action(text,jsonb)'::regprocedure),chr(13),'');
 original:=$old$  elsif command='private_withdraw' then
   photo:=(input->>'photo')::uuid;
   if not exists(select 1 from marriage.photo_assets a where a.id=photo and a.owner_id=target) then raise exception 'الصورة غير متاحة.';end if;
   delete from marriage.photo_grants where photo_id=photo;
   get diagnostics n=row_count;result:=jsonb_build_object('withdrawn',n);
$old$;
 if strpos(definition,original)=0 then raise exception 'Unexpected marriage.ops_action definition';end if;
 execute replace(definition,original,$new$$new$);
 definition:=replace(pg_get_functiondef('marriage.ops_inspect(text,jsonb)'::regprocedure),chr(13),'');
 original:=$old$ 'privatePhotos',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'grants',(select count(*) from marriage.photo_grants g where g.photo_id=p.id and g.expires_at>now()))),'[]') from marriage.photo_assets p where p.owner_id=target and p.state='active'),
 'photoHistory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select kind,recorded_at as at,expires_at as until from marriage.photo_grant_log where owner_id=target order by id desc limit 12)x),
$old$;
 if strpos(definition,original)=0 then raise exception 'Unexpected marriage.ops_inspect definition';end if;
 execute replace(definition,original,$new$ 'privatePhotos','[]'::jsonb,'photoHistory','[]'::jsonb,
$new$);
 definition:=replace(pg_get_functiondef('marriage.my_settings()'::regprocedure),chr(13),'');
 original:=$old$ select coalesce(jsonb_agg(jsonb_build_object('requestId',g.request_id,
   'name',coalesce(case when marriage.relationship_open(me,g.recipient_id) then marriage.closure_alias(g.recipient_id) end,'عضو'),'expiresAt',g.expires_at)
   order by g.expires_at), '[]'::jsonb) into shares
 from marriage.photo_assets p join marriage.photo_grants g on g.photo_id=p.id
 where p.owner_id=me and p.state='active' and g.expires_at>now();

$old$;
 if strpos(definition,original)=0 then raise exception 'Unexpected marriage.my_settings definition';end if;
 execute replace(definition,original,$new$ shares:='[]'::jsonb;

$new$);
end $migration$;
