-- Exposure changes ordering only. All filtering, reciprocal eligibility and scores
-- remain owned by the existing browse query. Five percentage points is the maximum
-- ranking bonus; it never changes the compatibility evidence returned to members.
do $boost$ declare definition text; begin
 definition:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 if position('f.fit, f.rank_value from marriage.profiles p' in definition)=0 then
  raise exception 'Unexpected discovery ranking definition';
 end if;
 definition:=replace(definition,'f.fit, f.rank_value from marriage.profiles p',
 'f.fit, f.rank_value + case when marriage.is_serious(p.member_id) then 0.05 else 0 end as rank_value from marriage.profiles p');
 execute definition;
end $boost$;
-- A stable random three per weekly batch prevents refresh/filter/pagination from
-- becoming an oracle for all compatibility values. No raw answers are disclosed.
create function marriage.free_recommendation_allowed(viewer uuid,subject uuid) returns boolean
language sql stable set search_path='' as $$
 select subject in (select candidate_id from marriage.weekly_candidates
 where member_id=viewer and week_start=marriage.current_week()
 order by md5(viewer::text||candidate_id::text||week_start::text),candidate_id limit 3)
$$;
create or replace function marriage.discovery_card(viewer uuid,subject uuid,recommended boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare card jsonb:=marriage.member_card(viewer,subject); f jsonb;begin
 if recommended and not marriage.is_paid(viewer) and marriage.free_recommendation_allowed(viewer,subject) then
  select fit into f from marriage.pair_fit(viewer,subject);
  card:=card||jsonb_build_object('recommendationPercentage',case
   when (f->>'assessmentComplete')::boolean and not (f->>'provisional')::boolean
    and (f->>'total')::integer>0 and f->>'total'=f->>'covered' then f->'percentage' else null end);
 end if;
 return card;
end $$;
-- The legacy recommendations endpoint must use the same guarded projection.
do $legacy$ declare definition text;begin
 definition:=pg_get_functiondef('marriage.discover(integer,integer,text,uuid)'::regprocedure);
 definition:=replace(definition,'marriage.member_card(me,p.member_id)','marriage.discovery_card(me,p.member_id,true)');
 execute definition;
end $legacy$;
revoke all on function marriage.free_recommendation_allowed(uuid,uuid) from public,anon,authenticated;
