create or replace function public.wudayn_publications(platform text,build integer,opened uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is not null and not exists(select from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=actor and (s.not_after is null or s.not_after>now())) then return '[]';end if;
 if platform not in ('web','ios') or build not between 1 and 999999 then return '[]'; end if;
 if actor is not null and opened is not null then
  insert into marriage.publication_readers select p.id,actor,now() from marriage.publications p
  where p.id=opened and p.withdrawn_at is null and now()>=p.starts_at and now()<p.ends_at and marriage.publication_visible(p.audience,actor,platform,build)
  on conflict do nothing;
 end if;
 -- The inbox size limit must not evict a live setting, banner, or the notice just opened.
 return (
  with visible as (
   select p.id,p.placement,p.screen,p.title,p.body,p.destination,p.setting_key as key,
    p.starts_at as stamp,p.ends_at as expires,p.created_at
   from marriage.publications p
   where p.withdrawn_at is null and now()>=p.starts_at and now()<p.ends_at
    and (actor is not null or (p.placement in ('banner','setting') and p.screen in ('all','register','welcome')))
    and marriage.publication_visible(p.audience,actor,platform,build)
  ), ranked as (
   select v.*,row_number() over (
    partition by case v.placement when 'setting' then 'setting:'||v.key
                                   when 'banner' then 'banner:'||v.screen else 'feed' end
    order by v.stamp desc,v.created_at desc,v.id desc
   ) as position from visible v
  )
  select coalesce(jsonb_agg(to_jsonb(items) order by items.stamp desc,items.id desc),'[]'::jsonb)
  from (
   select r.id,r.placement,r.screen,r.title,r.body,r.destination,r.key,r.stamp,r.expires,
    exists(select from marriage.publication_readers rr where rr.publication_id=r.id and rr.member_id=actor) as opened
   from ranked r
   where r.id=opened or r.position<=case when r.placement='setting' then 1 else 100 end
  ) items
 );
end $$;
