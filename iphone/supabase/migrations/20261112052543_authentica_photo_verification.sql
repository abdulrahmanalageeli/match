-- Face comparison only; no liveness or government identity assertion.
create table marriage.photo_face_checks(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references marriage.members(id) on delete cascade,
 photo_id uuid not null, kind text not null check(kind in('portrait','gallery')), object_id text not null,
 created_at timestamptz not null default now(), matched_at timestamptz, consumed_at timestamptz,
 image_sha256 text, consent_version text not null default 'face-photo-v1'
);
create index photo_face_owner on marriage.photo_face_checks(member_id,created_at);
alter table marriage.photo_face_checks enable row level security;
revoke all on marriage.photo_face_checks from public,anon,authenticated,service_role;

create function marriage.photo_face_required() returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 return exists(select 1 from marriage.profiles where member_id=me and gender='man');
end $$;
create function public.marriage_photo_face_required() returns boolean language sql security invoker set search_path='' as $$select marriage.photo_face_required()$$;
revoke all on function marriage.photo_face_required(),public.marriage_photo_face_required() from public,anon,authenticated,service_role;
grant execute on function marriage.photo_face_required(),public.marriage_photo_face_required() to authenticated;

create function public.marriage_photo_face_begin(member uuid,photo uuid,photo_kind text,consent text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target_path text;bucket text;obj text;attempt uuid;begin
 if consent is distinct from 'face-photo-v1' then raise exception 'consent_required';end if;
 perform 1 from marriage.members where id=member and not suspended for update;
 if not found or not exists(select 1 from marriage.profiles where member_id=member and gender='man') then raise exception 'not_allowed';end if;
 if photo_kind='portrait' then
  select path into target_path from marriage.member_portraits where id=photo and member_id=member and not ready and blur=0 and clear_path is null and created_at>now()-interval '15 minutes';
  bucket:='nisfayn-profile-portraits';
 elsif photo_kind='gallery' then
  select path into target_path from marriage.profile_gallery where id=photo and member_id=member and not ready and created_at>now()-interval '15 minutes';
  bucket:='nisfayn-profile-gallery';
 else raise exception 'not_allowed';end if;
 select id::text into obj from storage.objects where bucket_id=bucket and name=target_path and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 3145728;
 if obj is null then raise exception 'photo_unavailable';end if;
 if (select count(*) from marriage.photo_face_checks where member_id=member and created_at>now()-interval '1 minute')>=3
 or (select count(*) from marriage.photo_face_checks where member_id=member and created_at>now()-interval '24 hours')>=10 then raise exception 'rate_limited';end if;
 -- Only metadata is retained; expiry also bounds records for deleted/replaced photos.
 delete from marriage.photo_face_checks where member_id=member and created_at<now()-interval '30 days';
 insert into marriage.photo_face_checks(member_id,photo_id,kind,object_id) values(member,photo,photo_kind,obj) returning id into attempt;
 return jsonb_build_object('attempt',attempt,'bucket',bucket,'path',target_path);
end $$;

create function public.marriage_photo_face_finish(attempt uuid,member uuid,image_hash text) returns boolean
language plpgsql security definer set search_path='' as $$begin
 if image_hash is null or image_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid_hash';end if;
 update marriage.photo_face_checks set matched_at=now(),image_sha256=image_hash
 where id=attempt and member_id=member and matched_at is null and consumed_at is null and created_at>now()-interval '2 minutes';
 if not found then raise exception 'expired_attempt';end if;
 return true;
end $$;
revoke all on function public.marriage_photo_face_begin(uuid,uuid,text,text),public.marriage_photo_face_finish(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.marriage_photo_face_begin(uuid,uuid,text,text),public.marriage_photo_face_finish(uuid,uuid,text) to service_role;

create function marriage.enforce_photo_face_check() returns trigger language plpgsql security definer set search_path='' as $$
declare target_kind text:=case when tg_table_name='member_portraits' then 'portrait' else 'gallery' end;proof uuid;begin
 if not new.ready or (tg_op='UPDATE' and old.ready) then return new;end if;
 if not exists(select 1 from marriage.profiles where member_id=new.member_id and gender='man') then return new;end if;
 select c.id into proof from marriage.photo_face_checks c join storage.objects o on o.id::text=c.object_id
 where c.member_id=new.member_id and c.photo_id=new.id and c.kind=target_kind and c.matched_at is not null
 and c.consumed_at is null and c.created_at>now()-interval '15 minutes'
 and o.name=new.path and o.bucket_id=case when target_kind='portrait' then 'nisfayn-profile-portraits' else 'nisfayn-profile-gallery' end
 order by c.created_at desc limit 1 for update of c;
 if proof is null then raise exception 'تحقق من مطابقة صورتك عبر الكاميرا قبل نشرها.' using errcode='42501';end if;
 update marriage.photo_face_checks set consumed_at=now() where id=proof;
 return new;
end $$;
revoke all on function marriage.enforce_photo_face_check() from public,anon,authenticated,service_role;
create trigger portrait_face_check before insert or update of ready on marriage.member_portraits for each row execute function marriage.enforce_photo_face_check();
create trigger gallery_face_check before insert or update of ready on marriage.profile_gallery for each row execute function marriage.enforce_photo_face_check();

-- Prevent delete/re-upload between server comparison and publication. Gallery remove
-- RPC deletes its metadata first; orphaned objects can still be removed afterward.
create function marriage.gallery_object_removable(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select split_part(object_name,'/',1)=auth.uid()::text and not exists(select 1 from marriage.profile_gallery where path=object_name)
$$;
revoke all on function marriage.gallery_object_removable(text) from public,anon,authenticated,service_role;
grant execute on function marriage.gallery_object_removable(text) to authenticated;
drop policy gallery_delete on storage.objects;
create policy gallery_delete on storage.objects for delete to authenticated using(bucket_id='nisfayn-profile-gallery' and storage.allow_any_operation(array['object.delete','object.delete_many']) and marriage.gallery_object_removable(name));

create function marriage.photo_discard(photo uuid,photo_kind text) returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();begin
 if photo_kind='portrait' then delete from marriage.member_portraits where id=photo and member_id=me and not ready;
 elsif photo_kind='gallery' then delete from marriage.profile_gallery where id=photo and member_id=me and not ready;
 end if;
end $$;
create function public.marriage_photo_discard(photo uuid,photo_kind text) returns void language sql security invoker set search_path='' as $$select marriage.photo_discard($1,$2)$$;
revoke all on function marriage.photo_discard(uuid,text),public.marriage_photo_discard(uuid,text) from public,anon,authenticated,service_role;
grant execute on function marriage.photo_discard(uuid,text),public.marriage_photo_discard(uuid,text) to authenticated;
