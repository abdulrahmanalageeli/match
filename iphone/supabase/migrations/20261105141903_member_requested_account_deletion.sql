-- Defines the opt-in member action. Installing this migration does not delete
-- data. Only the caller's verified, live Auth session can invoke this routine.
create function marriage.delete_own_account() returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();
begin
 perform 1 from marriage.members where id=me for update;
 delete from auth.sessions where user_id=me;
 delete from auth.users where id=me;
 return true;
end $$;
create function public.marriage_delete_account() returns boolean
language sql security invoker set search_path='' as $$select marriage.delete_own_account()$$;
revoke all on function marriage.delete_own_account(),public.marriage_delete_account() from public,anon,authenticated,service_role;
grant execute on function marriage.delete_own_account(),public.marriage_delete_account() to authenticated;
