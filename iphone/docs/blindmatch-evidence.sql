-- Run on the BlindMatch event database. This SELECT returns aggregate counts only.
-- Event and phase are part of each observation. No participant records are returned.
with directions as (
  select m.match_id, m.event_id, f.phase, m.participant_number as chooser, f.partner,
         bool_or(f.feedback->>'wantConnect'='true') as wanted,
         bool_or(coalesce(f.feedback->>'meetingOccurred'='true',false)
              or coalesce(f.feedback->>'meetingStatus'='met',false)) as confirmed,
         min(m.created_at) as assigned_at
    from public.event3_matches m
    cross join lateral (values
      (2,m.phase2_partner,m.phase2_feedback),
      (3,m.phase3_partner,m.phase3_feedback),
      (4,m.phase4_partner,m.phase4_feedback)
    ) as f(phase,partner,feedback)
    join public.event3_participants chooser on chooser.match_id=m.match_id
      and chooser.event_id=m.event_id and chooser.participant_number=m.participant_number
    join public.event3_participants peer on peer.match_id=m.match_id
      and peer.event_id=m.event_id and peer.participant_number=f.partner
   where m.event_id between 20 and 28
     and not exists(select 1 from public.event3_test_mode_snapshots s
                     where s.match_id=m.match_id and s.event_id=m.event_id)
     and m.participant_number<>f.partner
     -- Standing participant exclusion in the September BlindMatch audit.
     and 1778 not in(m.participant_number,f.partner)
     and jsonb_typeof(f.feedback->'wantConnect')='boolean'
     and (f.feedback->>'meetingOccurred') is distinct from 'false'
     and coalesce(f.feedback->>'meetingStatus','met')='met'
   group by m.match_id,m.event_id,f.phase,m.participant_number,f.partner
  having count(distinct f.feedback->>'wantConnect')=1
), pairs as (
  select a.match_id,a.event_id,a.phase,a.chooser,a.partner,
         a.wanted as a_yes,b.wanted as b_yes,least(a.assigned_at,b.assigned_at) as assigned_at
    from directions a join directions b using(match_id,event_id,phase)
   where a.chooser=b.partner and a.partner=b.chooser and a.chooser<a.partner
), question_pairs as (
  select p.event_id,p.a_yes,p.b_yes,item.id,
         translate(upper(trim(coalesce(a.survey_data->'answers'->>item.id,a.survey_data->>item.id,item.a_fallback))), 'أابجده', 'AABCDE') as a_answer,
         translate(upper(trim(coalesce(b.survey_data->'answers'->>item.id,b.survey_data->>item.id,item.b_fallback))), 'أابجده', 'AABCDE') as b_answer
    from pairs p
    join public.participants a on a.assigned_number=p.chooser
    join public.participants b on b.assigned_number=p.partner
    cross join lateral (values ('attachment_3',null::text,null::text),('lifestyle_4',null,null),
      ('conversation_depth_pref',a.conversation_depth_pref,b.conversation_depth_pref),
      ('curiosity_style',a.curiosity_style,b.curiosity_style)) item(id,a_fallback,b_fallback)
   where a.survey_data_updated_at<=p.assigned_at and b.survey_data_updated_at<=p.assigned_at
), cohorts(first_event) as (values(20),(26))
select 'cohort' as section,first_event::text as item,
       jsonb_build_object('first_event',first_event,'last_event',28,'recorded',d.recorded,
         'yes',d.yes,'confirmed',d.confirmed,'complete',p.complete,'both_yes',p.both_yes,
         'split',p.split,'neither',p.neither) as counts
  from cohorts
  cross join lateral (
    select count(*) as recorded,count(*) filter(where wanted) as yes,count(*) filter(where confirmed) as confirmed
      from directions where event_id>=first_event
  ) d
  cross join lateral (
    select count(*) as complete,count(*) filter(where a_yes and b_yes) as both_yes,
           count(*) filter(where a_yes<>b_yes) as split,count(*) filter(where not a_yes and not b_yes) as neither
      from pairs where event_id>=first_event
  ) p
union all
select 'question',id,jsonb_build_object(
         'matched_yes',count(*) filter(where a_answer=b_answer and a_yes and b_yes),
         'matched_total',count(*) filter(where a_answer=b_answer),
         'different_yes',count(*) filter(where a_answer<>b_answer and a_yes and b_yes),
         'different_total',count(*) filter(where a_answer<>b_answer),
         'events',count(distinct event_id))
  from question_pairs where a_answer in ('A','B','C','D') and b_answer in ('A','B','C','D')
 group by id
 order by section,item;
