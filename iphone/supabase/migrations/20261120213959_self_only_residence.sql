-- Keep accepted legacy answer codes for signed receipts. New v4 applications only need the member's own residence plan.
create function pg_temp.revise_residence(fn regprocedure, old_text text, new_text text)
returns void language plpgsql as $$
declare body text := pg_get_functiondef(fn);
begin
 if strpos(body,old_text)=0 then raise exception 'Unexpected definition of %',fn; end if;
 execute replace(body,old_text,new_text);
end $$;

select pg_temp.revise_residence('marriage.valid_required_v4_answers(jsonb)',
 $old$where not coalesce(value ? answer,false)$old$,
 $new$where not coalesce(value ? answer,false) and not (key='preference:residence_plan:partner' and answer is null)$new$);
select pg_temp.revise_residence('marriage.interview_complete_v5(jsonb)',
 $old$jsonb_array_length(doc->'confirmed')=45$old$, $new$jsonb_array_length(doc->'confirmed') in (44,45)$new$);
select pg_temp.revise_residence('marriage.interview_complete_v5(jsonb)',
 $old$where not(skip_parenting$old$, $new$where (key<>'preference:residence_plan:partner' or doc->'confirmed' @> '[{"id":"preference:residence_plan:partner"}]') and not(skip_parenting$new$);

-- Use the same mutually reachable cities as the discovery eligibility rule. Unknown facts carry no score.
create function marriage.residence_credit(a uuid, b uuid, plan_a text, plan_b text) returns float8
language sql stable strict set search_path='' as $$
 select case when plan_a in ('A','B','C') and plan_b in ('A','B','C') and
   (select count(*) from marriage.profiles p join marriage.cities c on c.id=p.city_id
     where p.member_id in(a,b) and marriage.city_filter_key(c.label) not in ('','مدينه اخري داخل السعوديه','مدينه اخري خارج السعوديه'))=2
 then marriage.common_city_possible(a,b)::int::float8 end
$$;
revoke all on function marriage.residence_credit(uuid,uuid,text,text) from public,anon,authenticated,service_role;

select pg_temp.revise_residence('marriage.current_practical_fit(uuid,uuid)',
 $old$marriage.expectation_credit(d.code,a,b,pa.option_code,sb.option_code) as ab$old$,
 $new$case when d.code='residence_plan' then marriage.residence_credit(a,b,sa.option_code,sb.option_code) else marriage.expectation_credit(d.code,a,b,pa.option_code,sb.option_code) end as ab$new$);
select pg_temp.revise_residence('marriage.current_practical_fit(uuid,uuid)',
 $old$marriage.expectation_credit(d.code,b,a,pb.option_code,sa.option_code) as ba$old$,
 $new$case when d.code='residence_plan' then marriage.residence_credit(a,b,sa.option_code,sb.option_code) else marriage.expectation_credit(d.code,b,a,pb.option_code,sa.option_code) end as ba$new$);
select pg_temp.revise_residence('marriage.current_practical_fit(uuid,uuid)',
 $old$wanted_a is distinct from undecided$old$, $new$(code='residence_plan' or wanted_a is distinct from undecided)$new$);
select pg_temp.revise_residence('marriage.current_practical_fit(uuid,uuid)',
 $old$wanted_b is distinct from undecided$old$, $new$(code='residence_plan' or wanted_b is distinct from undecided)$new$);
select pg_temp.revise_residence('marriage.preference_evidence(uuid,uuid)',
 $old$when not complete then 'missing'$old$,
 $new$when code='residence_plan' and marriage.pair_contract(a,b)='marriage-v4'
    then case marriage.residence_credit(a,b,sa,sb) when 1 then 'aligned' when 0 then 'different' else 'missing' end
   when not complete then 'missing'$new$);
select pg_temp.revise_residence('marriage.strict_v4_conflict(uuid,uuid)',
 $old$where r.member_id=asker and marriage.can_answer_topic$old$,
 $new$where r.member_id=asker and d.code<>'residence_plan' and marriage.can_answer_topic$new$);
