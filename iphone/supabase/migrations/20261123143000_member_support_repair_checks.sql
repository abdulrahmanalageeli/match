-- Qualify the verified contact so PostgreSQL can distinguish it from the
-- function's output variable on both contact disclosure and password recovery.
do $migration$
declare definition text:=pg_get_functiondef('marriage.ops_action(text,jsonb)'::regprocedure);
begin
 if strpos(definition,'select phone from marriage.signup_phone_verifications where user_id=target')=0 then raise exception 'Unexpected member contact lookup';end if;
 execute replace(definition,'select phone from marriage.signup_phone_verifications where user_id=target',
   'select v.phone from marriage.signup_phone_verifications v where v.user_id=target');
end $migration$;


-- When staff reopen a saved draft, previously loaded devices must fetch the
-- new revision before writing or deleting it. Ordinary drafts keep their API.
alter table marriage.onboarding_drafts add column support_revision uuid;
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
 if strpos(definition,'if command=''delete'' then')=0 or strpos(definition,'select document into doc from marriage.onboarding_drafts')=0 then raise exception 'Unexpected draft persistence definition';end if;
 definition:=replace(definition,'if command=''delete'' then',$guard$
 if command in ('save','delete') and exists(select 1 from marriage.onboarding_drafts d where d.member_id=me and d.expires_at>now() and d.support_revision is not null and d.support_revision::text is distinct from payload->>'_supportRevision') then
   raise exception 'حدّث المسودة بعد تعديل فريق المتابعة ثم أعد حفظها.' using errcode='40001';
 end if;
 if command='delete' then$guard$);
 definition:=replace(definition,'select document into doc from marriage.onboarding_drafts',
   'select case when support_revision is null then document else document||jsonb_build_object(''_supportRevision'',support_revision) end into doc from marriage.onboarding_drafts');
 execute definition;
 definition:=pg_get_functiondef('marriage.ops_action(text,jsonb)'::regprocedure);
 if strpos(definition,'update marriage.onboarding_drafts set document=document')=0 or strpos(definition,'elsif command=''private_withdraw'' then')=0 then raise exception 'Unexpected draft repair definition';end if;
 definition:=replace(definition,'update marriage.onboarding_drafts set document=document',
   'update marriage.onboarding_drafts set support_revision=gen_random_uuid(),document=document');
 definition:=replace(definition,'elsif command=''private_withdraw'' then',$guard$
   perform pg_advisory_xact_lock(hashtextextended('onboarding-draft:'||target::text,0));
   update marriage.onboarding_drafts set support_revision=gen_random_uuid(),updated_at=now() where member_id=target and expires_at>now();
  elsif command='private_withdraw' then$guard$);
 execute definition;
end $migration$;

-- A job removed by retention/sign-out has no observed delivery receipt.
do $migration$
declare definition text:=pg_get_functiondef('marriage.ops_check(uuid,uuid,text,jsonb,timestamptz)'::regprocedure);
 old_check text:=$old$not exists(select 1 from marriage.push_outbox where id=any(array(select jsonb_array_elements_text(expected->'jobs')::uuid)) and (outcome is null or outcome<>'sent'))$old$;
begin
 if strpos(definition,old_check)=0 then raise exception 'Unexpected notification repair postcondition';end if;
 execute replace(definition,old_check,$new$jsonb_array_length(expected->'jobs')>0 and not exists(select 1 from jsonb_array_elements_text(expected->'jobs') job(id)
  where not exists(select 1 from marriage.push_outbox o where o.id=job.id::uuid and o.member_id=target and o.outcome='sent'))$new$);
end $migration$;


-- Expose timestamps and coverage for the live calculation without returning either
-- member's answers. A closed or ineligible relationship receives no fit result.
do $migration$
declare definition text:=pg_get_functiondef('marriage.ops_inspect(text,jsonb)'::regprocedure);
begin
 if strpos(definition,'''occupiesSlot'',r.status=''accepted''')=0 or strpos(definition,'''lastConfirmation'',')=0 then raise exception 'Unexpected diagnostic projection';end if;
 definition:=replace(definition,'''occupiesSlot'',r.status=''accepted''',$diag$
   'fitCheck',case when marriage.relationship_eligible(target,peer) and r.status in('pending','accepted') then
      (select jsonb_build_object('at',statement_timestamp(),'provisional',f.provisional,'covered',f.covered) from marriage.pair_fit(target,peer) f) end,
   'occupiesSlot',r.status='accepted'$diag$);
 definition:=replace(definition,'''lastConfirmation'',',$diag$
   'lastProfileEdit',greatest(account.last_public_profile_edit_at,(select max(s.created_at) from marriage.staff_audit s
       where s.target_type='member' and s.target_id=target and s.action in('edit_profile','ops_city'))),
   'lastConfirmation',$diag$);
 execute definition;
end $migration$;
