-- A renewal, upgrade or revocation can supersede a still-unexpired old transaction.
-- Attribute today's trial/paid counts to the current production receipt in each Apple subscription.
create view marriage.launch_current_receipts as
select distinct on(t.original_id) t.* from marriage.launch_receipts t
join marriage.subscription_owners o using(original_id)
left join marriage.store_transactions snapshot on snapshot.transaction_id=o.status_transaction
where (o.status_transaction is null or t.transaction_id=o.status_transaction or t.purchased_at>snapshot.purchased_at or t.purchased_at>o.status_at)
order by t.original_id,t.purchased_at desc,(t.transaction_id=o.status_transaction) desc nulls last,t.signed_at desc,t.transaction_id desc;
revoke all on marriage.launch_current_receipts from public,anon,authenticated,service_role;

do $migration$ declare definition text:=pg_get_functiondef('marriage.admin_launch_analytics(date,date)'::regprocedure);
 edits record;begin
 for edits in select * from(values
  ($old$b.original_id=t.original_id and b.trial and b.purchased_at<t.purchased_at)$old$,
   $new$b.original_id=t.original_id and b.trial and b.purchased_at<t.purchased_at
   and not exists(select 1 from marriage.launch_receipts paid where paid.original_id=b.original_id and not paid.trial
    and not paid.revoked and paid.purchased_at>b.purchased_at and paid.purchased_at<t.purchased_at))$new$),
  ($old$from marriage.launch_receipts t where trial and expires_at>now() and not revoked$old$,
   $new$from marriage.launch_current_receipts t where trial and effective_end>now() and not revoked and (status_transaction is distinct from transaction_id or coalesce(renewal_status,1) not in(2,3,5))$new$),
  ($old$select 1 from marriage.launch_receipts t where t.member_id=m.member_id and not t.trial and not t.revoked and effective_end>now()$old$,
   $new$select 1 from marriage.launch_current_receipts t where t.member_id=m.member_id and not t.trial and not t.revoked and effective_end>now() and (status_transaction is distinct from transaction_id or coalesce(renewal_status,1) not in(2,3,5))$new$),
  ($old$select 'purchase',count(*),min(t.purchased_at),'applications' from marriage.launch_receipts t$old$,
   $new$select 'purchase',count(distinct t.member_id),min(t.purchased_at),'applications' from marriage.launch_current_receipts t$new$)
 )v(needle,replacement) loop
  if strpos(definition,edits.needle)=0 then raise exception 'Unexpected launch analytics source';end if;
  definition:=replace(definition,edits.needle,edits.replacement);
 end loop;
 execute definition;
 definition:=pg_get_functiondef('marriage.admin_launch_directory(text,text,integer,uuid)'::regprocedure);
 if strpos(definition,'not m.store_access and exists(select 1 from marriage.launch_receipts t')=0 then raise exception 'Unexpected purchase incident filter';end if;
 execute replace(definition,'not m.store_access and exists(select 1 from marriage.launch_receipts t','not m.store_access and exists(select 1 from marriage.launch_current_receipts t');
end $migration$;
