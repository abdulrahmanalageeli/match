-- Support may handle ordinary open tickets and their own assigned cases. All other admin RPCs retain their existing role lists.
alter table marriage.staff_accounts drop constraint staff_accounts_role_check,
 add constraint staff_accounts_role_check check(role in ('owner','reviewer','moderator','support'));
alter table marriage.staff_invitations drop constraint staff_invitations_role_check,
 add constraint staff_invitations_role_check check(role in ('owner','reviewer','moderator','support'));

-- admin_access claims only trusted reservations and require_staff always checks the live session,
-- current database role and MFA. Neither relies on client role metadata.
create function marriage.support_ticket_visible(t marriage.support_requests,staff marriage.staff_accounts) returns boolean
 language sql immutable set search_path='' as $$
 select staff.role is distinct from 'support' or (t.category in ('help','access','billing')
  and t.deletion_requested_at is null and t.export_offered_at is null
  and (t.assigned_staff=staff.user_id or (t.assigned_staff is null and t.status<>'resolved')))
$$;
revoke all on function marriage.support_ticket_visible(marriage.support_requests,marriage.staff_accounts) from public,anon,authenticated,service_role;

do $migration$
declare definition text; change record; begin
 -- Keep the original data validation, idempotency and pagination on both list and reply.
 definition:=pg_get_functiondef('marriage.support_before_case_verification(text,jsonb)'::regprocedure);
 for change in select * from (values
  ($old$array['owner','moderator']$old$,$new$array['owner','moderator','support']$new$),
  ($old$and (action='admin_list' or s.owner_id=me);$old$,$new$and (action='admin_list' or s.owner_id=me) and marriage.support_ticket_visible(s,staff);$new$),
  ($old$where (action='admin_list' or s.owner_id=me) and (action='list'$old$,$new$where (action='admin_list' or s.owner_id=me) and marriage.support_ticket_visible(s,staff) and (action='list'$new$),
  ($old$select * into previous from marriage.support_actions$old$,$new$if staff.role='support' then
   select * into t from marriage.support_requests s where s.id=(payload->>'id')::uuid and marriage.support_ticket_visible(s,staff) for update;
   if not found then raise exception 'الطلب غير متاح لهذا الدور.' using errcode='42501';end if;
  end if;
  select * into previous from marriage.support_actions$new$),
  ($old$set status=support.status,response=support.response,revision=s.revision+1$old$,
   $new$set status=support.status,response=support.response,assigned_staff=case when staff.role='support' then staff.user_id else s.assigned_staff end,revision=s.revision+1$new$)
 ) v(needle,replacement) loop
  if strpos(definition,change.needle)=0 then raise exception 'Unexpected ticket queue definition';end if;
  definition:=replace(definition,change.needle,change.replacement);
 end loop;
 execute definition;
 definition:=pg_get_functiondef('marriage.support(text,jsonb)'::regprocedure);
 if strpos(definition,$old$perform marriage.require_staff(array['owner','moderator']);$old$)=0
 or strpos(definition,'declare t marriage.support_requests;me uuid;')=0
 or strpos(definition,'if exists(select 1 from marriage.support_checks c where c.ticket_id=t.id')=0 then raise exception 'Unexpected support verification gate';end if;
 definition:=replace(definition,'declare t marriage.support_requests;me uuid;','declare t marriage.support_requests;me uuid;staff marriage.staff_accounts;');
 definition:=replace(definition,$old$perform marriage.require_staff(array['owner','moderator']);$old$,
  $new$staff:=marriage.require_staff(array['owner','moderator','support']);$new$);
 -- Before checking repair outcomes, enforce the same visibility check on the locked case.
 definition:=replace(definition,$old$if exists(select 1 from marriage.support_checks c where c.ticket_id=t.id$old$,
  $new$if staff.role='support' and (not found or not marriage.support_ticket_visible(t,staff)) then
   raise exception 'الطلب غير متاح لهذا الدور.' using errcode='42501';end if;
  if exists(select 1 from marriage.support_checks c where c.ticket_id=t.id$new$);
 execute definition;
 -- The owner can assign eligible cases directly to the support team.
 definition:=pg_get_functiondef('marriage.ops_action(text,jsonb)'::regprocedure);
 if strpos(definition,$old$a.role in('owner','moderator')$old$)=0 then raise exception 'Unexpected case assignment gate';end if;
 execute replace(definition,$old$a.role in('owner','moderator')$old$,$new$(a.role in('owner','moderator') or a.role='support' and row_ticket.category in('help','access','billing') and row_ticket.deletion_requested_at is null and row_ticket.export_offered_at is null)$new$);
end $migration$;
