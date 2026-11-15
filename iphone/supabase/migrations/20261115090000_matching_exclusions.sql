-- A private, read-only list. Never disclose blocks made by the other member.
create function marriage.matching_exclusions() returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); begin
 return (with entries as (
  select b.blocked_id as id, coalesce(p.display_name,'عضو') as alias,
   'blocked'::text as reason, b.created_at as since, 0 as priority
  from marriage.blocks b left join marriage.profiles p on p.member_id=b.blocked_id where b.member_id=me
  union all
  select case when r.requester_id=me then r.recipient_id else r.requester_id end,
   coalesce(case when r.requester_id=me then r.closed_recipient_alias else r.closed_requester_alias end,'عضو'),
   'no_rematch',coalesce(r.closed_at,r.updated_at),1
  from marriage.member_requests r where me in(r.requester_id,r.recipient_id)
   and ((r.status='cancelled' and not r.allow_rematch) or (r.status='declined' and r.recipient_id=me))
   and coalesce(r.closure_outcome,'closed')<>'expired'
 ), unique_entries as (select distinct on(id) * from entries order by id,priority,since desc)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'alias',alias,'reason',reason,'since',since) order by since desc,id),'[]'::jsonb) from unique_entries);
end $$;
create function public.marriage_matching_exclusions() returns jsonb
language sql security invoker set search_path='' as $$select marriage.matching_exclusions()$$;
revoke all on function marriage.matching_exclusions(),public.marriage_matching_exclusions() from public,anon;
grant execute on function marriage.matching_exclusions(),public.marriage_matching_exclusions() to authenticated;
