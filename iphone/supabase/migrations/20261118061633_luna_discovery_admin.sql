-- Search only the viewer-visible projection, preserving Discovery eligibility.
create table marriage.luna_search_usage (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 day date not null default current_date, requests integer not null default 0,
 blocked boolean not null default false, last_used_at timestamptz
);
create table marriage.admin_membership_grants (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 tier text not null check(tier in('premium','seriousness')), expires_at timestamptz not null
);
alter table marriage.luna_search_usage enable row level security;
alter table marriage.admin_membership_grants enable row level security;
revoke all on marriage.luna_search_usage,marriage.admin_membership_grants from public,anon,authenticated;

alter function marriage.is_paid_before_owner_testing(uuid) rename to is_paid_before_admin_grants;
create function marriage.is_paid_before_owner_testing(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.is_paid_before_admin_grants(target) or exists(select 1 from marriage.admin_membership_grants where member_id=target and expires_at>now())
$$;
alter function marriage.is_serious_before_owner_testing(uuid) rename to is_serious_before_admin_grants;
create function marriage.is_serious_before_owner_testing(target uuid) returns boolean language sql stable set search_path='' as $$
 select marriage.is_serious_before_admin_grants(target) or exists(select 1 from marriage.admin_membership_grants where member_id=target and tier='seriousness' and expires_at>now())
$$;

create function public.marriage_luna_search_reserve() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_discovery_member(); usage marriage.luna_search_usage; begin
 if not marriage.is_serious(me) then raise exception 'البحث مع لونا متاح لوسام الجدية.' using errcode='42501';end if;
 insert into marriage.luna_search_usage(member_id) values(me) on conflict do nothing;
 select * into usage from marriage.luna_search_usage where member_id=me for update;
 if usage.blocked then raise exception 'البحث مع لونا موقوف لهذا الحساب. تواصل مع الدعم.' using errcode='42501';end if;
 if usage.day=current_date and usage.requests>=30 then raise exception 'وصلت إلى ٣٠ بحثًا اليوم. جرّب غدًا.' using errcode='54000';end if;
 update marriage.luna_search_usage set day=current_date,requests=case when day=current_date then requests+1 else 1 end,last_used_at=now() where member_id=me;
 return jsonb_build_object('reserved',true);
end $$;

create function marriage.luna_normalize(value text) returns text language sql immutable set search_path='' as $$
 select lower(translate(regexp_replace(coalesce(value,''),'[ًٌٍَُِّْـ]','','g'),'أإآىة','ااايه'))
$$;
create function marriage.luna_score(card jsonb,plan jsonb) returns integer language plpgsql immutable set search_path='' as $$
declare haystack text:=marriage.luna_normalize((card - array['id','fit','reasons','connectionId','portrait','photos','gallery','membershipTier','premium'])::text); criterion jsonb; hit boolean; score integer:=0; begin
 if plan is null then return 0;end if;
 if jsonb_typeof(plan)<>'array' or jsonb_array_length(plan)>10 or length(plan::text)>6000 then raise exception 'خطة البحث غير صالحة.' using errcode='22023';end if;
 for criterion in select value from jsonb_array_elements(plan) loop
  if criterion->>'kind' not in('must','prefer','exclude') or jsonb_typeof(criterion->'terms') is distinct from 'array' or jsonb_array_length(criterion->'terms') not between 1 and 8 then raise exception 'معيار بحث غير صالح.' using errcode='22023';end if;
  select exists(select 1 from jsonb_array_elements_text(criterion->'terms') term where length(term) between 2 and 80 and strpos(haystack,marriage.luna_normalize(term))>0) into hit;
  if (criterion->>'kind'='must' and not hit) or (criterion->>'kind'='exclude' and hit) then return -1;end if;
  if hit and criterion->>'kind'<>'exclude' then score:=score+1;end if;
 end loop;
 return score;
end $$;

-- Keep the existing single eligibility query and apply relevance before LIMIT.
do $migration$ declare definition text; begin
 definition:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 if strpos(definition,'where p.member_id<>me')=0 or strpos(definition,'rank_value desc,member_id')=0 then raise exception 'Unexpected browse definition';end if;
 definition:=replace(definition,'if not marriage.is_paid(me)',
 'if options ? ''luna'' and (not marriage.is_serious(me) or exists(select 1 from marriage.luna_search_usage where member_id=me and blocked)) then raise exception ''البحث مع لونا متاح لوسام الجدية.'' using errcode=''42501'';end if; if not marriage.is_paid(me)');
 definition:=replace(definition,'f.fit, f.rank_value','f.fit, case when options ? ''luna'' then marriage.luna_score(marriage.member_card(me,p.member_id),options->''luna'') else 0 end as luna_rank, f.rank_value');
 definition:=replace(definition,'page as (select * from eligible order by','page as (select * from eligible where luna_rank>=0 order by');
 definition:=replace(definition,'rank_value desc,member_id','luna_rank desc,rank_value desc,member_id');
 execute definition;
end $migration$;

-- Detailed management uses existing staff MFA, audit, row revisions and roles.
create function public.marriage_admin_membership(member_id uuid,selected_tier text,days integer,search_blocked boolean,expected_revision text,reason text,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare staff marriage.staff_accounts:=marriage.require_staff(array['owner']); prior marriage.staff_audit; fingerprint text; result jsonb; begin
 if request_id is null or length(btrim(coalesce(reason,''))) not between 3 and 500 or selected_tier is null or selected_tier not in('actual','premium','seriousness') or days is null or days not between 1 and 365 or search_blocked is null then raise exception 'تحقق من العضوية والمدة وسبب الإجراء.' using errcode='22023';end if;
 fingerprint:=md5(jsonb_build_array(member_id,selected_tier,days,search_blocked,expected_revision,btrim(reason))::text);
 perform pg_advisory_xact_lock(hashtextextended(staff.user_id::text||request_id::text,0));
 select * into prior from marriage.staff_audit a where a.actor_id=staff.user_id and a.request_id=marriage_admin_membership.request_id;
 if found then
  if prior.request_fingerprint is distinct from fingerprint then raise exception 'معرّف إجراء مستخدم.' using errcode='22023';end if;
  return prior.result;
 end if;
 perform 1 from marriage.members m where m.id=member_id for update;
 if not found then raise exception 'الحساب غير متاح.' using errcode='P0002';end if;
 if marriage.admin_review_revision(member_id) is distinct from expected_revision then raise exception 'تغيّر الملف. أعد فتحه.' using errcode='40001';end if;
 if selected_tier='actual' then delete from marriage.admin_membership_grants g where g.member_id=marriage_admin_membership.member_id;
 else insert into marriage.admin_membership_grants values(member_id,selected_tier,now()+make_interval(days=>days)) on conflict on constraint admin_membership_grants_pkey do update set tier=excluded.tier,expires_at=excluded.expires_at;end if;
 insert into marriage.luna_search_usage(member_id,blocked) values(member_id,search_blocked) on conflict on constraint luna_search_usage_pkey do update set blocked=excluded.blocked;
 update marriage.members set admin_revision=admin_revision+1 where id=member_id;
 result:=jsonb_build_object('saved',true);
 insert into marriage.staff_audit(actor_id,actor_name,actor_role,action,target_type,target_id,reason,request_id,request_fingerprint,result)
 values(staff.user_id,staff.display_name,staff.role,'membership_managed','member',member_id,btrim(reason)||' · '||selected_tier||' · '||days||' days · Luna blocked='||search_blocked,request_id,fingerprint,result);
 return result;
end $$;
alter function marriage.admin_member(uuid) rename to admin_member_before_luna;
create function marriage.admin_member(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=marriage.admin_member_before_luna(target);begin
 if exists(select 1 from marriage.members where id=target) then
 result:=result||jsonb_build_object('membershipTier',marriage.membership_tier(target),'membershipGrant',(select jsonb_build_object('tier',tier,'expiresAt',expires_at) from marriage.admin_membership_grants where member_id=target),'membershipTesting',marriage.test_membership_tier(target),'lunaSearch',coalesce((select jsonb_build_object('blocked',blocked,'requestsToday',case when day=current_date then requests else 0 end,'lastUsedAt',last_used_at) from marriage.luna_search_usage where member_id=target),jsonb_build_object('blocked',false,'requestsToday',0)));
 end if;return result;
end $$;
revoke all on function marriage.luna_normalize(text),marriage.luna_score(jsonb,jsonb),marriage.is_paid_before_admin_grants(uuid),marriage.is_paid_before_owner_testing(uuid),marriage.is_serious_before_admin_grants(uuid),marriage.is_serious_before_owner_testing(uuid),marriage.admin_member_before_luna(uuid),marriage.admin_member(uuid) from public,anon,authenticated;
revoke all on function public.marriage_luna_search_reserve(),public.marriage_admin_membership(uuid,text,integer,boolean,text,text,uuid) from public,anon;
grant execute on function public.marriage_luna_search_reserve(),public.marriage_admin_membership(uuid,text,integer,boolean,text,text,uuid) to authenticated;
grant execute on function marriage.admin_member(uuid) to authenticated;
