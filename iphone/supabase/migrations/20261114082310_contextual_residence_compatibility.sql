-- Residence answers describe a practical outcome, not an abstract letter match.
-- No profile answers or preferences are rewritten, and no unknown city is inferred.
create or replace function marriage.preference_answer_fit(dimension text, asker uuid, peer uuid, wanted text, observed text)
returns boolean language sql stable set search_path='' as $fit$
 select case
  when wanted is null or observed is null then null
  when dimension='residence_plan' and wanted in('A','B','C') and observed in('A','B','C') and exists(
   select 1 from marriage.profiles p join marriage.cities pc on pc.id=p.city_id
   join marriage.profiles q on q.member_id=peer join marriage.cities qc on qc.id=q.city_id
   where p.member_id=asker
    and marriage.city_filter_key(pc.label) not in('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه')
    and marriage.city_filter_key(pc.label)=marriage.city_filter_key(qc.label)
  ) then true
  else wanted=observed end
$fit$;
revoke all on function marriage.preference_answer_fit(text,uuid,uuid,text,text) from public,anon,authenticated,service_role;

-- Keep scoring weights, other criteria, moderation gates, and public RPCs intact.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('marriage.pair_fit_before_beena(uuid,uuid)'::regprocedure);
 if strpos(definition,'pa.option_code=sb.option_code')=0 or strpos(definition,'pb.option_code=sa.option_code')=0 then
  raise exception 'Contextual residence stopped: score definition changed';
 end if;
 definition:=replace(definition,'pa.option_code=sb.option_code','marriage.preference_answer_fit(d.code,a,b,pa.option_code,sb.option_code)');
 definition:=replace(definition,'pb.option_code=sa.option_code','marriage.preference_answer_fit(d.code,b,a,pb.option_code,sa.option_code)');
 execute definition;

 definition:=pg_get_functiondef('marriage.compatible_before_basics(uuid,uuid)'::regprocedure);
 if strpos(definition,'(want.option_code is null or peer.option_code is distinct from want.option_code)')=0 then
  raise exception 'Contextual residence stopped: eligibility definition changed';
 end if;
 execute replace(definition,'(want.option_code is null or peer.option_code is distinct from want.option_code)',
  '(marriage.preference_answer_fit(d.code,h.member_id,case when h.member_id=a then b else a end,want.option_code,peer.option_code) is not true)');

 definition:=pg_get_functiondef('marriage.preference_evidence(uuid,uuid)'::regprocedure);
 if strpos(definition,'pa=sb')=0 or strpos(definition,'pb=sa')=0 then
  raise exception 'Contextual residence stopped: evidence definition changed';
 end if;
 definition:=replace(definition,'pa=sb','marriage.preference_answer_fit(code,a,b,pa,sb)');
 definition:=replace(definition,'pb=sa','marriage.preference_answer_fit(code,b,a,pb,sa)');
 execute definition;
end $patch$;

update marriage.fit_dimensions set reason='مدينتاكما واختيارات السكن تتيحان الاستقرار في مدينة مشتركة.' where code='residence_plan';
