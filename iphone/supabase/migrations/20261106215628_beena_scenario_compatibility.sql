-- Nisfayn only. Beena is a voluntary, transparent preference comparison;
-- stories never enter scoring and private answers never enter public cards.
create table marriage.beena_scenarios (
 id text primary key, ordinal smallint not null unique, title text not null, prompt text not null,
 check(ordinal between 1 and 6)
);
-- Catalog values are generated from src/beena/catalog.json and parity-tested.
insert into marriage.beena_scenarios(id,ordinal,title,prompt) values
 ('family_boundaries',1,'نحن والأهل','كيف نحافظ على قربنا من أهلنا ومساحتنا كزوجين عندما تتزاحم التوقعات؟'),
 ('finances',2,'قرار مالي مفاجئ','كيف نقرر المصروفات المفاجئة، وما القرارات المالية التي نفضّل مناقشتها معًا؟'),
 ('conflict',3,'بعد سوء فهم','عندما ننزعج، هل نحتاج إلى الحديث فورًا أم إلى مهلة؟ وكيف نتفق على العودة للحوار؟'),
 ('career',4,'فرصة تغيّر الروتين','كيف نوازن بين طموح كل منا واستقرار حياتنا، وما التغييرات التي نحتاج إلى الاتفاق عليها؟'),
 ('household',5,'يوميات البيت','كيف نوزّع مسؤوليات البيت والتخطيط لها، ومتى نراجع التوزيع أو نطلب المساعدة؟'),
 ('support',6,'حين يثقل اليوم','كيف نعرف إن كان أحدنا يحتاج إلى الاستماع أو المساعدة العملية أو بعض المساحة؟');

create table marriage.beena_answers (
 member_id uuid not null references marriage.members(id) on delete cascade,
 scenario_id text not null references marriage.beena_scenarios(id),
 self_code text check(self_code in('A','B','C','D')),
 partner_codes text[] check(partner_codes <@ array['A','B','C','D']::text[] and cardinality(partner_codes)<=4),
 importance smallint check(importance in(1,2)), primary key(member_id,scenario_id)
);
create table marriage.beena_stories (
 member_id uuid primary key references marriage.members(id) on delete cascade,
 scenario_id text not null references marriage.beena_scenarios(id),
 story_text text not null check(char_length(story_text)<=500), share boolean not null default false
);
create table nisfayn_test.beena_answers (
 actor text not null references marriage.admin_test_members(actor) on delete cascade,
 scenario_id text not null references marriage.beena_scenarios(id),
 self_code text check(self_code in('A','B','C','D')),
 partner_codes text[] check(partner_codes <@ array['A','B','C','D']::text[] and cardinality(partner_codes)<=4),
 importance smallint check(importance in(1,2)), primary key(actor,scenario_id)
);
create table nisfayn_test.beena_stories (
 actor text primary key references marriage.admin_test_members(actor) on delete cascade,
 scenario_id text not null references marriage.beena_scenarios(id),
 story_text text not null check(char_length(story_text)<=500), share boolean not null default false
);
alter table marriage.beena_scenarios enable row level security;
alter table marriage.beena_answers enable row level security;
alter table marriage.beena_stories enable row level security;
alter table nisfayn_test.beena_answers enable row level security;
alter table nisfayn_test.beena_stories enable row level security;
revoke all on marriage.beena_scenarios,marriage.beena_answers,marriage.beena_stories,
 nisfayn_test.beena_answers,nisfayn_test.beena_stories from public,anon,authenticated,service_role;

create function marriage.normalize_beena(value jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare entry record;answer jsonb;story jsonb;
begin
 if value is null or value='null'::jsonb or value='{}'::jsonb then return null;end if;
 if jsonb_typeof(value) is distinct from 'object' or value->>'version' is distinct from 'beena-v1'
  or jsonb_typeof(value->'answers') is distinct from 'object' then
  raise exception 'تحقق من نسخة مواقف بيننا وإجاباتها.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(value) k where k not in('version','answers','story')) then
  raise exception 'تحقق من حقول مواقف بيننا.' using errcode='22023';end if;
 for entry in select * from jsonb_each(value->'answers') loop
  answer:=entry.value;
  if not exists(select 1 from marriage.beena_scenarios where id=entry.key) or jsonb_typeof(answer) is distinct from 'object' then
   raise exception 'موقف أو إجابة غير صالحة في بيننا.' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(answer) k where k not in('self','partner','importance'))
   or (answer?'self' and (jsonb_typeof(answer->'self') is distinct from 'string' or answer->>'self' not in('A','B','C','D')))
   or (answer?'importance' and answer->'importance' not in('1'::jsonb,'2'::jsonb)) then
   raise exception 'تحقق من اختيارات مواقف بيننا.' using errcode='22023';end if;
  if answer?'partner' then
   if jsonb_typeof(answer->'partner') is distinct from 'array' then
    raise exception 'تحقق من الاختيارات المقبولة للشريك في بيننا.' using errcode='22023';end if;
   if jsonb_array_length(answer->'partner')>4
    or exists(select 1 from jsonb_array_elements(answer->'partner') v where v not in('"A"','"B"','"C"','"D"'))
    or exists(select 1 from jsonb_array_elements(answer->'partner') v group by v having count(*)>1) then
    raise exception 'تحقق من الاختيارات المقبولة للشريك في بيننا.' using errcode='22023';end if;
  end if;
 end loop;
 if value?'story' then
  story:=value->'story';
  if jsonb_typeof(story) is distinct from 'object' then raise exception 'تحقق من قصة بيننا.' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(story) k where k not in('scenarioId','text','share'))
   or not exists(select 1 from marriage.beena_scenarios where id=story->>'scenarioId')
   or jsonb_typeof(story->'text') is distinct from 'string' or char_length(story->>'text')>500
   or jsonb_typeof(story->'share') is distinct from 'boolean' then
   raise exception 'اختر موقفًا واكتب قصة لا تتجاوز ٥٠٠ حرف وحدد مشاركتها صراحة.' using errcode='22023';end if;
 end if;
 if value->'answers'='{}'::jsonb and not(value?'story') then return null;end if;
 return value;
end $$;

create function marriage.beena_json(target uuid) returns jsonb language sql stable set search_path='' as $$
 with own as(select coalesce(jsonb_object_agg(scenario_id,jsonb_strip_nulls(jsonb_build_object(
  'self',self_code,'partner',partner_codes,'importance',importance))),'{}'::jsonb) answers
  from marriage.beena_answers where member_id=$1), story as(select jsonb_build_object(
  'scenarioId',scenario_id,'text',story_text,'share',share) value from marriage.beena_stories where member_id=$1)
 select case when marriage.signup_consents_json($1)->'assessment'='true'::jsonb and (answers<>'{}'::jsonb or story.value is not null)
  then jsonb_strip_nulls(jsonb_build_object('version','beena-v1','answers',answers,'story',story.value)) end
 from own left join story on true
$$;
create function nisfayn_test.beena_json(target text) returns jsonb language sql stable set search_path='' as $$
 with own as(select coalesce(jsonb_object_agg(scenario_id,jsonb_strip_nulls(jsonb_build_object(
  'self',self_code,'partner',partner_codes,'importance',importance))),'{}'::jsonb) answers
  from nisfayn_test.beena_answers where actor=$1), story as(select jsonb_build_object(
  'scenarioId',scenario_id,'text',story_text,'share',share) value from nisfayn_test.beena_stories where actor=$1)
 select case when nisfayn_test.signup_consents_json($1)->'assessment'='true'::jsonb and (answers<>'{}'::jsonb or story.value is not null)
  then jsonb_strip_nulls(jsonb_build_object('version','beena-v1','answers',answers,'story',story.value)) end
 from own left join story on true
$$;

create function marriage.beena_shared_story(value jsonb) returns jsonb language sql immutable set search_path='' as $$
 select case when $1#>'{story,share}'='true'::jsonb and length(btrim($1#>>'{story,text}'))>0
  then ($1->'story')-'share' end
$$;

create function marriage.compare_beena(first_profile jsonb,second_profile jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=jsonb_build_object('version','beena-v1','covered',0,'total',6,'complete',false,'percentage',null,
 'aligned','[]'::jsonb,'discussion','[]'::jsonb,'prompts','[]'::jsonb);
 scenario record;a jsonb;b jsonb;ab boolean;ba boolean;aw integer;bw integer;ap integer:=0;bp integer:=0;atotal integer:=0;btotal integer:=0;n integer:=0;kind text;
begin
 first_profile:=marriage.normalize_beena(first_profile);second_profile:=marriage.normalize_beena(second_profile);
 if first_profile is null or second_profile is null then return result;end if;
 for scenario in select * from marriage.beena_scenarios order by ordinal loop
  a:=first_profile#>array['answers',scenario.id];b:=second_profile#>array['answers',scenario.id];
  if a->>'self' is null or b->>'self' is null or coalesce(jsonb_array_length(a->'partner'),0)=0 or coalesce(jsonb_array_length(b->'partner'),0)=0 then continue;end if;
  n:=n+1;ab:=(a->'partner')?(b->>'self');ba:=(b->'partner')?(a->>'self');
  aw:=coalesce((a->>'importance')::integer,1);bw:=coalesce((b->>'importance')::integer,1);
  ap:=ap+ab::integer*aw;atotal:=atotal+aw;bp:=bp+ba::integer*bw;btotal:=btotal+bw;
  kind:=case when ab and ba then 'aligned' else 'discussion' end;
  result:=jsonb_set(result,array[kind],(result->kind)||jsonb_build_array(scenario.id));
  result:=jsonb_set(result,'{prompts}',(result->'prompts')||jsonb_build_array(jsonb_build_object('scenarioId',scenario.id,'kind',kind,'prompt',scenario.prompt)));
 end loop;
 return result||jsonb_build_object('covered',n,'complete',n=6,'percentage',case when n=6 then round(50*(ap::numeric/atotal+bp::numeric/btotal))::integer end);
end $$;

create function marriage.save_beena(target uuid,value jsonb) returns void language plpgsql set search_path='' as $$
begin
 delete from marriage.beena_answers where member_id=target;
 delete from marriage.beena_stories where member_id=target;
 if value is null then return;end if;
 insert into marriage.beena_answers(member_id,scenario_id,self_code,partner_codes,importance)
  select target,key,v->>'self',case when v?'partner' then array(select jsonb_array_elements_text(v->'partner')) end,(v->>'importance')::smallint
  from jsonb_each(value->'answers') e(key,v);
 if value?'story' then insert into marriage.beena_stories values(target,value#>>'{story,scenarioId}',value#>>'{story,text}',(value#>>'{story,share}')::boolean);end if;
end $$;
create function nisfayn_test.save_beena(target text,value jsonb) returns void language plpgsql set search_path='' as $$
begin
 delete from nisfayn_test.beena_answers where actor=target;
 delete from nisfayn_test.beena_stories where actor=target;
 if value is null then return;end if;
 insert into nisfayn_test.beena_answers(actor,scenario_id,self_code,partner_codes,importance)
  select target,key,v->>'self',case when v?'partner' then array(select jsonb_array_elements_text(v->'partner')) end,(v->>'importance')::smallint
  from jsonb_each(value->'answers') e(key,v);
 if value?'story' then insert into nisfayn_test.beena_stories values(target,value#>>'{story,scenarioId}',value#>>'{story,text}',(value#>>'{story,share}')::boolean);end if;
end $$;

-- All eligibility/dealbreakers and the established compatibility percentage stay intact.
-- A completed Beena result only nudges future weekly selection/live directory ordering ±5%.
alter function marriage.pair_fit(uuid,uuid) rename to pair_fit_before_beena;
create function marriage.pair_fit(a uuid,b uuid)
returns table(fit jsonb,rank_value double precision,covered integer,shared integer,provisional boolean)
language sql stable set search_path='' as $$
 with comparison as materialized(select marriage.compare_beena(marriage.beena_json($1),marriage.beena_json($2)) value)
 select base.fit||jsonb_build_object('beena',comparison.value),
  base.rank_value*case when (comparison.value->>'complete')::boolean then .95+(comparison.value->>'percentage')::float8/1000 else 1 end,
  base.covered,base.shared,base.provisional
 from marriage.pair_fit_before_beena($1,$2) base cross join comparison
$$;

-- Self-only payload augmentation avoids treating private scenario answers as public profile edits.
alter function marriage.member_state(uuid) rename to member_state_before_beena;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_beena(target);
begin
 if jsonb_typeof(result->'profile')='object' then result:=jsonb_set(result,'{profile}',(result->'profile')||jsonb_build_object('beena',marriage.beena_json(target)));end if;
 return result;
end $$;
alter function marriage.member_card(uuid,uuid) rename to member_card_before_beena;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_card_before_beena(viewer,subject);story jsonb;
begin
 result:=result-array['beena','beenaStory'];
 if exists(select 1 from marriage.members where id=subject and review_status='approved') then
  story:=marriage.beena_shared_story(marriage.beena_json(subject));
  if story is not null then result:=result||jsonb_build_object('beenaStory',story);end if;
 end if;
 return result;
end $$;

alter function marriage.apply_profile(jsonb) rename to apply_profile_before_beena;
create function marriage.apply_profile(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_member();value jsonb;previous jsonb;choices jsonb;result jsonb;shared_story jsonb;
begin
 perform 1 from marriage.members where id=me for update;
 previous:=marriage.beena_json(me);
 value:=case when payload?'beena' then marriage.normalize_beena(payload->'beena') else previous end;
 choices:=coalesce(payload->'signupConsents',marriage.signup_consents_json(me));
 if choices->'assessment' is distinct from 'true'::jsonb then
  -- Explicit withdrawal clears even a stale client draft in the same request.
  if payload#>'{signupConsents,assessment}'='false'::jsonb then value:=null;
  elsif payload?'beena' and value is not null then raise exception 'وافق على معالجة التوافق قبل حفظ مواقف بيننا.' using errcode='22023';
  else value:=null;end if;
 end if;
 result:=marriage.apply_profile_before_beena(payload-'beena'-'beenaStory');
 perform marriage.save_beena(me,value);
 shared_story:=marriage.beena_shared_story(value);
 -- New public prose follows profile review. Existing introductions remain open:
 -- changing this optional story cannot silently end an established conversation.
 if shared_story is not null and shared_story is distinct from marriage.beena_shared_story(previous)
  and exists(select 1 from marriage.members where id=me and review_status='approved') then
  update marriage.members set review_status='pending' where id=me;
  insert into marriage.reviews(member_id,action) values(me,'submit');
 end if;
 return marriage.member_state(me);
end $$;

-- A reviewer may see only the opted-in public story; private scenario choices stay private.
alter function marriage.admin_member(uuid) rename to admin_member_before_beena;
create function marriage.admin_member(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=marriage.admin_member_before_beena(target);story jsonb:=marriage.beena_shared_story(coalesce(
 marriage.beena_json(target),(select nisfayn_test.beena_json(actor) from marriage.admin_test_members where id=target)));
begin
 if story is not null then result:=result||jsonb_build_object('beenaStory',story);end if;
 return result;
end $$;
alter function marriage.personal_data() rename to personal_data_before_beena;
create function marriage.personal_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member();result jsonb:=marriage.personal_data_before_beena();
begin return jsonb_set(result,'{profile,beena}',coalesce(marriage.beena_json(me),'null'::jsonb));end $$;

alter function public.nisfayn_test_rpc(text,text,jsonb) set schema nisfayn_test;
alter function nisfayn_test.nisfayn_test_rpc(text,text,jsonb) rename to rpc_before_beena;
create function public.nisfayn_test_rpc(action text,session_token text default '',payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare who text;person text;value jsonb;previous jsonb;choices jsonb;result jsonb;profiles jsonb;story jsonb;incoming jsonb;
begin
 if action='profile' then
  select actor into who from nisfayn_test.sessions where token_hash=sha256(session_token::bytea) and expires_at>now();
  if who is null then raise exception 'انتهت جلسة الاختبار. سجّل الدخول مجددًا.' using errcode='42501';end if;
  perform 1 from marriage.admin_test_members where actor=who for update;
  incoming:=payload->'profile';
  previous:=nisfayn_test.beena_json(who);
  value:=case when incoming?'beena' then marriage.normalize_beena(incoming->'beena') else previous end;
  choices:=coalesce(incoming->'signupConsents',nisfayn_test.signup_consents_json(who));
  if choices->'assessment' is distinct from 'true'::jsonb then
   if incoming#>'{signupConsents,assessment}'='false'::jsonb then value:=null;
   elsif incoming?'beena' and value is not null then raise exception 'وافق على معالجة التوافق قبل حفظ مواقف بيننا.' using errcode='22023';
   else value:=null;end if;
  end if;
  result:=nisfayn_test.rpc_before_beena(action,session_token,jsonb_set(payload,'{profile}',incoming-array['beena','beenaStory']));
  perform nisfayn_test.save_beena(who,value);
  if value is distinct from previous then update marriage.admin_test_members set revision=revision+1 where actor=who;end if;
  result:=result||jsonb_build_object('profileRevision',(select marriage.admin_review_revision(id) from marriage.admin_test_members where actor=who));
 else result:=nisfayn_test.rpc_before_beena(action,session_token,payload);end if;
 if jsonb_typeof(result->'profiles')='object' then
  who:=result->>'actor';profiles:=result->'profiles';
  for person in select jsonb_object_keys(profiles) loop
   profiles:=jsonb_set(profiles,array[person],(profiles->person)-array['beena','beenaStory']);
   value:=nisfayn_test.beena_json(person);
   if person=who then profiles:=jsonb_set(profiles,array[person],(profiles->person)||jsonb_build_object('beena',value));
   else
    story:=marriage.beena_shared_story(value);
    if story is not null then profiles:=jsonb_set(profiles,array[person,'beenaStory'],story);end if;
   end if;
  end loop;
  result:=jsonb_set(result,'{profiles}',profiles)||jsonb_build_object('beenaFit',marriage.compare_beena(
   nisfayn_test.beena_json(who),nisfayn_test.beena_json(case when who='reham' then 'abdulrahman' else 'reham' end)));
 end if;
 return result;
end $$;

revoke all on function marriage.normalize_beena(jsonb),marriage.beena_json(uuid),nisfayn_test.beena_json(text),
 marriage.beena_shared_story(jsonb),marriage.compare_beena(jsonb,jsonb),marriage.save_beena(uuid,jsonb),nisfayn_test.save_beena(text,jsonb),
 marriage.pair_fit_before_beena(uuid,uuid),marriage.pair_fit(uuid,uuid),marriage.member_state_before_beena(uuid),marriage.member_state(uuid),
 marriage.member_card_before_beena(uuid,uuid),marriage.member_card(uuid,uuid),marriage.apply_profile_before_beena(jsonb),marriage.apply_profile(jsonb),
 marriage.admin_member_before_beena(uuid),marriage.admin_member(uuid),marriage.personal_data_before_beena(),marriage.personal_data(),
 nisfayn_test.rpc_before_beena(text,text,jsonb),public.nisfayn_test_rpc(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function marriage.apply_profile(jsonb),marriage.admin_member(uuid),marriage.personal_data() to authenticated;
grant execute on function public.nisfayn_test_rpc(text,text,jsonb) to service_role;
