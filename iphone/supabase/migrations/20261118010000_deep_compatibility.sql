-- Mutual analysis uses only saved assessment evidence. Joint drafts stay private
-- until both owners review disclosure. A member can inspect their own isolated
-- interpretation, never the partner's inputs or interpretation.
create table marriage.deep_analyses (
 id uuid primary key default gen_random_uuid(),
 connection_id uuid not null references marriage.member_requests(id) on delete cascade,
 requester_id uuid not null references marriage.members(id) on delete cascade,
 recipient_id uuid not null references marriage.members(id) on delete cascade,
 status text not null check(status in('requested','ready','generating','review','shared','declined','cancelled','stale','failed')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default now()+interval '7 days',
 snapshot jsonb, fingerprint text, report jsonb,
 a_decisions jsonb, b_decisions jsonb,
 lease uuid, leased_until timestamptz, attempts integer not null default 0,
 check(requester_id<>recipient_id)
);
create index deep_analyses_connection on marriage.deep_analyses(connection_id,created_at desc);
create index deep_analyses_requester on marriage.deep_analyses(requester_id,created_at desc);
alter table marriage.deep_analyses enable row level security;
revoke all on marriage.deep_analyses from public,anon,authenticated,service_role;
create trigger deep_analysis_signal after insert or update on marriage.deep_analyses
 for each row execute function marriage.signal_community_change();

-- Persist the versioned personality wording; source mirrors personality-v1.
create table marriage.deep_personality_catalog(code text primary key,prompt text not null);
insert into marriage.deep_personality_catalog values
 ('social_energy','أشعر بنشاط أكبر بعد قضاء وقت مع مجموعة من الناس.'),
 ('initiative','أبادر بفتح المواضيع عندما أتعرف إلى شخص جديد.'),
 ('depth','أستمتع بالتعمق في فكرة واحدة أكثر من التنقل بين مواضيع كثيرة.'),
 ('openness','أشارك مشاعري وتجربتي الشخصية بسهولة عندما أشعر بالأمان.'),
 ('closeness','أحب مشاركة تفاصيل يومي والتواصل المتكرر مع شريك حياتي.'),
 ('reassurance','يطمئنني التعبير الواضح والمتكرر عن الاهتمام.'),
 ('support','عندما أمر بضغط، أفضل الحديث عنه مع شخص أثق به.'),
 ('planning','أفضل الاتفاق على تفاصيل خططنا قبل موعدها بوقت كافٍ.'),
 ('novelty','أتحمس لتجربة أنشطة وأماكن جديدة بدل تكرار المألوف.'),
 ('conflict_pace','أفضل مناقشة الخلاف فورًا بدل تأجيله إلى وقت أهدأ.'),
 ('directness','أقول بوضوح ما أحتاجه وما يزعجني في العلاقة.'),
 ('quiet_comfort','أرتاح للحظات الهدوء مع شخص قريب دون الحاجة لملئها بالكلام.');
alter table marriage.deep_personality_catalog enable row level security;
revoke all on marriage.deep_personality_catalog from public,anon,authenticated,service_role;

create function marriage.deep_evidence(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('assessmentVersion',(select version from marriage.member_assessment where member_id=target),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('key',k,'question',q,'answer',v) order by k) from (
  select 'answer:'||a.question_code k,q.label q,o.label v from marriage.member_answers a
  join marriage.questions q on q.code=a.question_code join marriage.question_options o on o.question_code=a.question_code and o.code=a.option_code where a.member_id=target
  union all select 'personality:'||a.question_code,c.prompt,case a.option_code when 'A' then 'لا يشبهني إطلاقًا' when 'B' then 'يشبهني قليلًا' when 'C' then 'يشبهني أحيانًا' when 'D' then 'يشبهني غالبًا' when 'E' then 'يشبهني كثيرًا' end
  from marriage.personality_answers a join marriage.deep_personality_catalog c on c.code=a.question_code where a.member_id=target
  union all select 'requirement:'||h.dimension,q.label,'شرط أساسي في الشريك' from marriage.fit_hard_requirements h join marriage.questions q on q.code=h.dimension where h.member_id=target
  union all select 'priority:'||p.category,coalesce(c.value->>'label',p.category),'أولوية شخصية' from marriage.fit_priorities p join marriage.member_assessment a on a.member_id=p.member_id join marriage.assessment_versions v on v.id=a.version cross join lateral jsonb_array_elements(v.catalog->'categories') c where p.member_id=target and c.value->>'id'=p.category
 ) entries),'[]'::jsonb))
$$;

create function marriage.deep_connection(connection_id uuid,actor uuid) returns marriage.member_requests
language plpgsql stable set search_path='' as $$
declare r marriage.member_requests;begin
 select * into r from marriage.member_requests where id=connection_id and actor in(requester_id,recipient_id) and status='accepted';
 if r.id is null or not marriage.relationship_open(r.requester_id,r.recipient_id) then
  raise exception 'التحليل متاح للتوافق القائم بين الطرفين فقط.' using errcode='42501';end if;
 return r;
end $$;

create function marriage.deep_complete(target uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from marriage.member_assessment where member_id=target and version='marriage-v2')
 and (select count(*) from marriage.member_answers a join marriage.questions q on q.code=a.question_code where a.member_id=target)=32
 and (select count(*) from marriage.personality_answers where member_id=target)=12
$$;

create function marriage.deep_view(item marriage.deep_analyses,viewer uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare own_side text:=case when viewer=item.requester_id then 'a' else 'b' end;
 view_status text:=coalesce(item.status,'none'); reviews jsonb:='[]'; findings jsonb:='[]'; can_request boolean;
begin
 if item.id is not null and (item.expires_at<=now() or (item.snapshot is not null and item.fingerprint is distinct from md5(jsonb_build_object('a',marriage.deep_evidence(item.requester_id),'b',marriage.deep_evidence(item.recipient_id))::text))) then view_status:='stale';end if;
 can_request:=marriage.is_serious(viewer) and view_status in('none','declined','cancelled','stale')
  and (select count(*) from marriage.deep_analyses where requester_id=viewer and created_at>now()-interval '1 day')<3;
 if view_status='review' then
  select coalesce(jsonb_agg(jsonb_build_object('id',f->>'id','section',f->>'section','ownInterpretation',f->'reviewText'->>own_side,'ownEvidence',(
   select coalesce(jsonb_agg(jsonb_build_object('key',e->>'key','label',e->>'question','value',e->>'answer')),'[]')
   from jsonb_array_elements(item.snapshot->own_side->'entries') e where exists(select 1 from jsonb_array_elements(f->'evidence') ref where ref->>'side'=own_side and ref->>'key'=e->>'key')
  ))),'[]') into reviews from jsonb_array_elements(item.report->'findings') f;
 elsif view_status='shared' then
  select coalesce(jsonb_agg(f-'evidence'-'reviewText'),'[]') into findings from jsonb_array_elements(item.report->'findings') f
   where item.a_decisions->>(f->>'id')='true' and item.b_decisions->>(f->>'id')='true';
 end if;
 return jsonb_build_object('id',item.id,'status',view_status,'canRequest',can_request,
 'requestedByMe',coalesce(viewer=item.requester_id,false),'myReviewed',case own_side when 'a' then item.a_decisions is not null else item.b_decisions is not null end,
 'peerReviewed',case own_side when 'a' then item.b_decisions is not null else item.a_decisions is not null end,
 'canGenerate',view_status in('ready','failed') and item.attempts<3 or (view_status='generating' and item.leased_until<now() and item.attempts<3),
 'review',reviews,'findings',findings);
end $$;

create function public.marriage_deep_analysis(connection_id uuid,action text default 'get',decisions jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=marriage.require_communication_member(); r marriage.member_requests; item marriage.deep_analyses; view_data jsonb; f jsonb; snap jsonb;
begin
 -- The actor lock makes the daily cap apply across concurrent connections.
 if action='request' then perform pg_advisory_xact_lock(hashtext('deep-request:'||me::text));end if;
 perform pg_advisory_xact_lock(hashtext('deep:'||connection_id::text));
 r:=marriage.deep_connection(connection_id,me);
 select * into item from marriage.deep_analyses d where d.connection_id=$1 order by created_at desc,id desc limit 1 for update;
 view_data:=marriage.deep_view(item,me);
 if action='get' then return view_data;end if;
 if action='request' then
  if item.status='requested' and item.requester_id=me and view_data->>'status'='requested' then return view_data;end if;
  if not (view_data->>'canRequest')::boolean then raise exception 'يتطلب إرسال التحليل وسام الجدية. عند تكرار الطلبات انتظر يومًا قبل المحاولة.' using errcode='42501';end if;
  insert into marriage.deep_analyses(connection_id,requester_id,recipient_id,status) values($1,me,case when r.requester_id=me then r.recipient_id else r.requester_id end,'requested') returning * into item;
 elsif action='cancel' then
  update marriage.deep_analyses set status='cancelled',snapshot=null,report=null,a_decisions=null,b_decisions=null,lease=null where id=item.id returning * into item;
 elsif action='decline' then
  if item.status<>'requested' or me<>item.recipient_id then raise exception 'الطلب غير متاح.' using errcode='42501';end if;
  update marriage.deep_analyses set status='declined' where id=item.id returning * into item;
 elsif action='accept' then
  if item.status<>'requested' or me<>item.recipient_id or view_data->>'status'='stale' then raise exception 'الطلب غير متاح.' using errcode='42501';end if;
  if not marriage.deep_complete(item.requester_id) or not marriage.deep_complete(item.recipient_id) then raise exception 'يلزم اكتمال إجابات التوافق والشخصية المحفوظة لكليكما قبل التحليل.' using errcode='22023';end if;
  snap:=jsonb_build_object('a',marriage.deep_evidence(item.requester_id),'b',marriage.deep_evidence(item.recipient_id));
  if jsonb_array_length(snap->'a'->'entries')=0 or jsonb_array_length(snap->'b'->'entries')=0 then raise exception 'لا توجد إجابات محفوظة كافية للتحليل.' using errcode='22023';end if;
  update marriage.deep_analyses set status='ready',snapshot=snap,fingerprint=md5(snap::text),expires_at=now()+interval '30 days' where id=item.id returning * into item;
 elsif action='review' then
  if view_data->>'status'<>'review' or jsonb_typeof(decisions) is distinct from 'object' then raise exception 'المراجعة غير متاحة.' using errcode='22023';end if;
  if (select count(*) from jsonb_object_keys(decisions))<>jsonb_array_length(item.report->'findings') then raise exception 'راجع كل إفصاح قبل المتابعة.' using errcode='22023';end if;
  for f in select value from jsonb_array_elements(item.report->'findings') loop
   if jsonb_typeof(decisions->(f->>'id')) is distinct from 'boolean' then raise exception 'راجع كل إفصاح قبل المتابعة.' using errcode='22023';end if;
  end loop;
  update marriage.deep_analyses set a_decisions=case when me=requester_id then decisions else a_decisions end,b_decisions=case when me=recipient_id then decisions else b_decisions end where id=item.id returning * into item;
  if item.a_decisions is not null and item.b_decisions is not null then
   -- A refused source must not be restated by an approved summary or another
   -- finding. Delete every dependent finding, not merely the refused card.
   select jsonb_build_object('findings',coalesce(jsonb_agg(entry.value),'[]')) into snap
    from jsonb_array_elements(item.report->'findings') entry
    where item.a_decisions->>(entry.value->>'id')='true' and item.b_decisions->>(entry.value->>'id')='true'
    and not exists(
     select 1 from jsonb_array_elements(item.report->'findings') rejected
     cross join lateral jsonb_array_elements(rejected.value->'evidence') denied
     where ((denied.value->>'side'='a' and item.a_decisions->>(rejected.value->>'id')='false')
      or (denied.value->>'side'='b' and item.b_decisions->>(rejected.value->>'id')='false'))
     and exists(select 1 from jsonb_array_elements(entry.value->'evidence') used where used.value=denied.value)
    );
   update marriage.deep_analyses set status='shared',report=snap where id=item.id returning * into item;
  end if;
 else raise exception 'إجراء غير صالح.' using errcode='22023';end if;
 return marriage.deep_view(item,me);
end $$;

create function public.marriage_deep_analysis_job(actor uuid,connection_id uuid,action text,lease uuid default null,report jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item marriage.deep_analyses; r marriage.member_requests; view_data jsonb; f jsonb; ref jsonb; ids text[]:='{}'; sections text[]:=array['summary','strengths','differences','patterns','expectations','friction','conversation','conclusion'];
begin
 perform pg_advisory_xact_lock(hashtext('deep:'||connection_id::text));
 r:=marriage.deep_connection(connection_id,actor);
 select * into item from marriage.deep_analyses d where d.connection_id=$2 order by created_at desc,id desc limit 1 for update;
 view_data:=marriage.deep_view(item,actor);
 if action='claim' then
  if view_data->>'status'='generating' and item.leased_until>now() then return jsonb_build_object('status','busy');end if;
  if not coalesce((view_data->>'canGenerate')::boolean,false) then return jsonb_build_object('status','idle');end if;
  update marriage.deep_analyses set status='generating',lease=gen_random_uuid(),leased_until=now()+interval '6 minutes',attempts=attempts+1 where id=item.id returning * into item;
  return jsonb_build_object('status','claimed','id',item.id,'lease',item.lease,'snapshot',item.snapshot);
 end if;
 if item.status<>'generating' or item.lease is distinct from lease or lease is null or item.leased_until<=now() or view_data->>'status'='stale' then raise exception 'انتهت صلاحية التحليل.' using errcode='42501';end if;
 if action='fail' then
  update marriage.deep_analyses set status='failed',lease=null,leased_until=null where id=item.id;
  return jsonb_build_object('status','failed');
 elsif action<>'publish' then raise exception 'إجراء غير صالح.' using errcode='22023';end if;
 if jsonb_typeof(report) is distinct from 'object' or jsonb_typeof(report->'findings') is distinct from 'array' or length(report::text)>100000 or jsonb_array_length(report->'findings') not between 8 and 32 then raise exception 'تقرير غير صالح.' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(report))<>1 then raise exception 'تقرير غير صالح.' using errcode='22023';end if;
 for f in select value from jsonb_array_elements(report->'findings') loop
  if jsonb_typeof(f) is distinct from 'object' or (select count(*) from jsonb_object_keys(f))<>6
   or coalesce(f->>'id','')!~'^f[1-9][0-9]?$' or f->>'id'=any(ids)
   or coalesce(f->>'section','')<>all(sections) or coalesce(f->>'kind','') not in('strength','manageable','incompatibility','uncertain')
   or jsonb_typeof(f->'text') is distinct from 'string' or length(btrim(f->>'text')) not between 20 and 3000
   or jsonb_typeof(f->'evidence') is distinct from 'array' or jsonb_array_length(f->'evidence') not between 2 and 16
   or jsonb_typeof(f->'reviewText') is distinct from 'object' or (select count(*) from jsonb_object_keys(f->'reviewText'))<>2
   or jsonb_typeof(f->'reviewText'->'a') is distinct from 'string' or length(btrim(f->'reviewText'->>'a')) not between 20 and 1500
   or jsonb_typeof(f->'reviewText'->'b') is distinct from 'string' or length(btrim(f->'reviewText'->>'b')) not between 20 and 1500 then raise exception 'نتائج التحليل غير صالحة.' using errcode='22023';end if;
  ids:=array_append(ids,f->>'id');
  for ref in select value from jsonb_array_elements(f->'evidence') loop
   if jsonb_typeof(ref) is distinct from 'object' or (select count(*) from jsonb_object_keys(ref))<>2 or coalesce(ref->>'side','') not in('a','b') or not exists(select 1 from jsonb_array_elements(item.snapshot->(ref->>'side')->'entries') e where e->>'key'=ref->>'key') then raise exception 'الدليل غير موجود في الإجابات.' using errcode='22023';end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(f->'evidence') e where e->>'side'='a') or not exists(select 1 from jsonb_array_elements(f->'evidence') e where e->>'side'='b') then raise exception 'يلزم دليل من الطرفين.' using errcode='22023';end if;
 end loop;
 if exists(select 1 from unnest(sections) s where not exists(select 1 from jsonb_array_elements(report->'findings') entry where entry.value->>'section'=s)) then raise exception 'أقسام التقرير غير مكتملة.' using errcode='22023';end if;
 update marriage.deep_analyses set status='review',report=$5,lease=null,leased_until=null where id=item.id;
 return jsonb_build_object('status','review');
end $$;

revoke all on function marriage.deep_evidence(uuid),marriage.deep_complete(uuid),marriage.deep_connection(uuid,uuid),marriage.deep_view(marriage.deep_analyses,uuid) from public,anon,authenticated,service_role;
revoke all on function public.marriage_deep_analysis(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.marriage_deep_analysis(uuid,text,jsonb) to authenticated;
revoke all on function public.marriage_deep_analysis_job(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.marriage_deep_analysis_job(uuid,uuid,text,uuid,jsonb) to service_role;

-- Ending or blocking a relationship withdraws consent permanently. Unblocking
-- or accepting again must never resurrect an old private report or lease.
create function marriage.deep_withdraw_relationship() returns trigger
language plpgsql security definer set search_path='' as $$
declare connection uuid;begin
 if tg_table_name='blocks' then
  for connection in select id from marriage.member_requests r
   where new.member_id in(r.requester_id,r.recipient_id) and new.blocked_id in(r.requester_id,r.recipient_id) order by id loop
   perform pg_advisory_xact_lock(hashtext('deep:'||connection::text));
   update marriage.deep_analyses set status='cancelled',snapshot=null,report=null,a_decisions=null,b_decisions=null,lease=null,leased_until=null
    where connection_id=connection;
  end loop;
 elsif old.status='accepted' and new.status<>'accepted' then
  perform pg_advisory_xact_lock(hashtext('deep:'||new.id::text));
  update marriage.deep_analyses set status='cancelled',snapshot=null,report=null,a_decisions=null,b_decisions=null,lease=null,leased_until=null
   where connection_id=new.id;
 end if;
 return new;
end $$;
revoke all on function marriage.deep_withdraw_relationship() from public,anon,authenticated,service_role;
create trigger deep_withdraw_on_block after insert on marriage.blocks for each row execute function marriage.deep_withdraw_relationship();
create trigger deep_withdraw_on_end after update of status on marriage.member_requests for each row execute function marriage.deep_withdraw_relationship();

-- Reuse the scheduled operational cleanup rather than introducing another job.
alter function marriage.operations_cleanup() rename to operations_cleanup_before_deep_analysis;
create function marriage.operations_cleanup() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; n integer;begin
 result:=marriage.operations_cleanup_before_deep_analysis();
 delete from marriage.deep_analyses d where d.expires_at<=now()
  or not marriage.relationship_open(d.requester_id,d.recipient_id)
  or not exists(select 1 from marriage.member_requests r where r.id=d.connection_id and r.status='accepted');
 get diagnostics n=row_count;
 return result||jsonb_build_object('expiredDeepAnalyses',n);
end $$;
revoke all on function marriage.operations_cleanup_before_deep_analysis(),marriage.operations_cleanup() from public,anon,authenticated,service_role;
grant execute on function marriage.operations_cleanup() to service_role;

-- Account export contains own sources/interpretations and shared report text,
-- never the other member's answers or an unpublished generated draft.
alter function marriage.personal_data() rename to personal_data_before_deep_analysis;
create function marriage.personal_data() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=marriage.require_member(); result jsonb; analyses jsonb;begin
 result:=marriage.personal_data_before_deep_analysis();
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'createdAt',d.created_at,'expiresAt',d.expires_at,
  'state',marriage.deep_view(d,me))),'[]') into analyses from marriage.deep_analyses d
 where me in(d.requester_id,d.recipient_id) and marriage.relationship_open(d.requester_id,d.recipient_id)
 and exists(select 1 from marriage.member_requests r where r.id=d.connection_id and r.status='accepted');
 return result||jsonb_build_object('deepCompatibilityAnalyses',analyses);
end $$;
revoke all on function marriage.personal_data_before_deep_analysis(),marriage.personal_data() from public,anon,authenticated,service_role;
grant execute on function marriage.personal_data() to authenticated;
