-- Restore the directory dependency on installations missing the personal-boundaries helper.
create or replace function marriage.permanent_boundary(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.blocks where (member_id=a and blocked_id=b) or (member_id=b and blocked_id=a))
 or exists(select 1 from marriage.member_requests r where least(r.requester_id,r.recipient_id)=least(a,b)
 and greatest(r.requester_id,r.recipient_id)=greatest(a,b)
 and r.status in ('declined','closed','cancelled') and marriage.request_suppresses_discovery(r))
 or exists(select 1 from marriage.introductions where member_a=least(a,b) and member_b=greatest(a,b) and closed_at is not null)
$$;
revoke all on function marriage.permanent_boundary(uuid,uuid) from public,anon,authenticated;
