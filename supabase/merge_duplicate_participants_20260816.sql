-- One-off production data repair.
--
-- Merges duplicate participant accounts sharing a normalized phone number while
-- explicitly excluding the phone groups containing #1466/#150 and #420/#7.
-- The most recently active account survives. Survey answers are merged per key,
-- with the most recently updated survey value winning and older accounts only
-- filling missing keys. Complete pre-change rows are written to the protected
-- participant_account_merge_backup table before any update or delete.

begin;
set local statement_timeout = '120s';
set local lock_timeout = '10s';

create temp table _merge_normalized on commit drop as
select
  p.*,
  case
    when regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') like '00966%'
      then substring(regexp_replace(phone_number, '\D', '', 'g') from 3)
    when regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') ~ '^05[0-9]{8}$'
      then '966' || substring(regexp_replace(phone_number, '\D', '', 'g') from 2)
    when regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') ~ '^5[0-9]{8}$'
      then '966' || regexp_replace(phone_number, '\D', '', 'g')
    else regexp_replace(coalesce(phone_number, ''), '\D', '', 'g')
  end as canonical_phone,
  greatest(
    coalesce(last_twilio_action_at, 'epoch'),
    coalesce(next_event_signup_timestamp, 'epoch'),
    coalesce(survey_data_updated_at, 'epoch'),
    created_at
  ) as meaningful_activity
from public.participants p;

create temp table _merge_exempt_phones on commit drop as
select distinct canonical_phone
from _merge_normalized
where assigned_number in (1466, 150, 420, 7);

create temp table _merge_ranked on commit drop as
with duplicate_phones as (
  select canonical_phone
  from _merge_normalized
  where length(canonical_phone) >= 9
    and canonical_phone not in (select canonical_phone from _merge_exempt_phones)
  group by canonical_phone
  having count(*) > 1
)
select
  n.*,
  row_number() over (
    partition by canonical_phone
    order by meaningful_activity desc, created_at desc, assigned_number desc
  ) as survivor_rank,
  row_number() over (
    partition by canonical_phone
    order by coalesce(survey_data_updated_at, created_at) desc,
      meaningful_activity desc,
      assigned_number desc
  ) as survey_base_rank
from _merge_normalized n
join duplicate_phones using (canonical_phone);

create temp table _merge_groups on commit drop as
select
  s.canonical_phone,
  s.id as survivor_id,
  s.assigned_number as survivor_number,
  d.id as survey_base_id,
  d.assigned_number as survey_base_number,
  array_agg(a.assigned_number order by a.assigned_number) as all_numbers,
  array_agg(a.assigned_number order by a.assigned_number)
    filter (where a.id <> s.id) as merged_numbers
from _merge_ranked s
join _merge_ranked d
  on d.canonical_phone = s.canonical_phone and d.survey_base_rank = 1
join _merge_ranked a on a.canonical_phone = s.canonical_phone
where s.survivor_rank = 1
group by s.canonical_phone, s.id, s.assigned_number, d.id, d.assigned_number;

create temp table _merge_map on commit drop as
select
  l.canonical_phone,
  l.id as loser_id,
  l.assigned_number as loser_number,
  g.survivor_id,
  g.survivor_number,
  g.survey_base_id,
  g.survey_base_number
from _merge_ranked l
join _merge_groups g using (canonical_phone)
where l.survivor_rank > 1;

-- Every answer key is taken from the most recently updated survey containing it.
create temp table _merge_latest_answers on commit drop as
select distinct on (r.canonical_phone, answer.key)
  r.canonical_phone,
  answer.key,
  answer.value
from _merge_ranked r
cross join lateral jsonb_each(coalesce(r.survey_data->'answers', '{}'::jsonb)) answer
order by r.canonical_phone, answer.key,
  coalesce(r.survey_data_updated_at, r.created_at) desc,
  r.meaningful_activity desc,
  r.assigned_number desc;

create temp table _merge_surveys on commit drop as
select
  g.canonical_phone,
  g.survivor_id,
  g.survey_base_id,
  coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb) as merged_answers
from _merge_groups g
left join _merge_latest_answers a using (canonical_phone)
group by g.canonical_phone, g.survivor_id, g.survey_base_id;

-- Lock all affected participant rows in a deterministic order.
select id
from public.participants
where id in (select id from _merge_ranked)
order by id
for update;

create temp table _merge_batch(id uuid) on commit drop;
with inserted as (
  insert into public.participant_account_merge_batches(
    reason,
    duplicate_phone_groups,
    merged_account_count
  )
  select
    'Authorized duplicate-account merge; #1466/#150 and #420/#7 phone groups explicitly excluded; latest active account retained; survey answers merged by latest survey timestamp',
    (select count(*) from _merge_groups),
    (select count(*) from _merge_map)
  returning id
)
insert into _merge_batch select id from inserted;

insert into public.participant_account_merge_log(
  batch_id,
  phone_hash,
  survivor_id,
  survivor_number,
  merged_id,
  merged_number,
  questionnaire_donor_id,
  questionnaire_donor_number
)
select
  b.id,
  left(md5(m.canonical_phone), 16),
  m.survivor_id,
  m.survivor_number,
  m.loser_id,
  m.loser_number,
  m.survey_base_id,
  m.survey_base_number
from _merge_map m
cross join _merge_batch b;

-- Back up every duplicate participant row before changing anything.
insert into public.participant_account_merge_backup(batch_id, source_table, row_data)
select b.id, 'participants', to_jsonb(p)
from public.participants p
join _merge_ranked r on r.id = p.id
cross join _merge_batch b;

-- Back up every related base-table row containing an affected participant UUID
-- or assigned number. The table discovery is intentionally limited to known
-- participant-reference column names.
do $backup$
declare
  rec record;
begin
  for rec in
    select
      c.table_name,
      string_agg(
        case
          when c.data_type = 'uuid'
            then format('t.%I in (select id from _merge_ranked)', c.column_name)
          else format('t.%I in (select assigned_number from _merge_ranked)', c.column_name)
        end,
        ' or ' order by c.ordinal_position
      ) as predicate
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in (
        'participants',
        'participant_account_merge_batches',
        'participant_account_merge_log',
        'participant_account_merge_backup'
      )
      and (
        c.column_name in (
          'participant_id', 'participant_number', 'assigned_number',
          'ranker_number', 'ranked_number', 'about_number',
          'participant_a_id', 'participant_b_id',
          'participant_a_number', 'participant_b_number',
          'participant_c_number', 'participant_d_number',
          'participant_e_number', 'participant_f_number',
          'participant1_number', 'participant2_number',
          'phase2_partner', 'phase3_partner'
        )
        or c.column_name ~* '^participant_[a-z]_number$'
      )
      and c.data_type in ('uuid', 'integer', 'bigint')
    group by c.table_name
  loop
    execute format(
      'insert into public.participant_account_merge_backup(batch_id, source_table, row_data)
       select (select id from _merge_batch), %L, to_jsonb(t)
       from public.%I t where %s',
      rec.table_name,
      rec.table_name,
      rec.predicate
    );
  end loop;
end
$backup$;

-- Put the merged survey/profile on the surviving account without replacing its
-- secure token, assigned number, event enrollment, payment, or current status.
update public.participants s
set
  survey_data = jsonb_set(
    jsonb_set(
      coalesce(d.survey_data, '{}'::jsonb),
      '{answers}',
      ms.merged_answers,
      true
    ),
    '{accountMerge}',
    jsonb_build_object(
      'batchId', (select id from _merge_batch),
      'mergedAt', now(),
      'mergedAccountNumbers', to_jsonb(g.merged_numbers),
      'surveyStrategy', 'latest_value_per_answer_key'
    ),
    true
  ),
  survey_data_updated_at = greatest(
    coalesce(d.survey_data_updated_at, d.created_at),
    coalesce(s.survey_data_updated_at, s.created_at)
  ),
  summary = coalesce(nullif(d.summary, ''), s.summary),
  ai_personality_analysis = coalesce(d.ai_personality_analysis, s.ai_personality_analysis),
  mbti_personality_type = coalesce(d.mbti_personality_type, s.mbti_personality_type),
  attachment_style = coalesce(d.attachment_style, s.attachment_style),
  communication_style = coalesce(d.communication_style, s.communication_style),
  gender = coalesce(d.gender, s.gender),
  age = coalesce(d.age, s.age),
  same_gender_preference = coalesce(d.same_gender_preference, s.same_gender_preference),
  any_gender_preference = coalesce(d.any_gender_preference, s.any_gender_preference),
  humor_banter_style = case
    when ms.merged_answers->>'humor_banter_style' in ('A', 'B', 'C', 'D')
      then ms.merged_answers->>'humor_banter_style'
    else coalesce(d.humor_banter_style, s.humor_banter_style)
  end,
  early_openness_comfort = case
    when ms.merged_answers->>'early_openness_comfort' ~ '^[0-3]$'
      then (ms.merged_answers->>'early_openness_comfort')::integer
    else coalesce(d.early_openness_comfort, s.early_openness_comfort)
  end,
  conversational_role = case
    when ms.merged_answers->>'conversational_role' in ('A', 'B', 'C')
      then ms.merged_answers->>'conversational_role'
    else coalesce(d.conversational_role, s.conversational_role)
  end,
  conversation_depth_pref = case
    when ms.merged_answers->>'conversation_depth_pref' in ('A', 'B')
      then ms.merged_answers->>'conversation_depth_pref'
    else coalesce(d.conversation_depth_pref, s.conversation_depth_pref)
  end,
  social_battery = case
    when ms.merged_answers->>'social_battery' in ('A', 'B')
      then ms.merged_answers->>'social_battery'
    else coalesce(d.social_battery, s.social_battery)
  end,
  humor_subtype = case
    when ms.merged_answers->>'humor_subtype' in ('A', 'B', 'C', 'D')
      then ms.merged_answers->>'humor_subtype'
    else coalesce(d.humor_subtype, s.humor_subtype)
  end,
  curiosity_style = case
    when ms.merged_answers->>'curiosity_style' in ('A', 'B', 'C')
      then ms.merged_answers->>'curiosity_style'
    else coalesce(d.curiosity_style, s.curiosity_style)
  end,
  intent_goal = case
    when ms.merged_answers->>'intent_goal' in ('A', 'B', 'C')
      then ms.merged_answers->>'intent_goal'
    else coalesce(d.intent_goal, s.intent_goal)
  end,
  silence_comfort = case
    when ms.merged_answers->>'silence_comfort' in ('A', 'B')
      then ms.merged_answers->>'silence_comfort'
    else coalesce(d.silence_comfort, s.silence_comfort)
  end,
  nationality = coalesce(d.nationality, s.nationality),
  prefer_same_nationality = coalesce(d.prefer_same_nationality, s.prefer_same_nationality),
  preferred_age_min = d.preferred_age_min,
  preferred_age_max = d.preferred_age_max,
  open_age_preference = coalesce(d.open_age_preference, s.open_age_preference),
  open_intent_goal_mismatch = coalesce(d.open_intent_goal_mismatch, s.open_intent_goal_mismatch),
  age_flex_one_year = case
    when lower(coalesce(ms.merged_answers->>'age_flex_one_year', '')) in ('true', 'accept', 'yes') then true
    when lower(coalesce(ms.merged_answers->>'age_flex_one_year', '')) in ('false', 'decline', 'no') then false
    when lower(coalesce(ms.merged_answers->>'age_flex_one_year', '')) = 'not_applicable' then null
    else d.age_flex_one_year
  end,
  updated_at = now()
from _merge_groups g
join _merge_surveys ms on ms.canonical_phone = g.canonical_phone
join public.participants d on d.id = g.survey_base_id
where s.id = g.survivor_id;

-- Requests made from an older login must resolve to the surviving token.
update public.organizer_requests o
set
  participant_token = s.secure_token,
  participant_name = coalesce(nullif(s.name, ''), o.participant_name)
from _merge_map m
join public.participants s on s.id = m.survivor_id
where o.participant_number = m.loser_number;

-- Normalize copied contact fields on rows that are moved.
update public.attendance_requests a
set phone_number = s.phone_number
from _merge_map m
join public.participants s on s.id = m.survivor_id
where a.participant_id = m.loser_id or a.assigned_number = m.loser_number;

update public.whatsapp_messages w
set phone_number = s.phone_number
from _merge_map m
join public.participants s on s.id = m.survivor_id
where w.participant_id = m.loser_id or w.assigned_number = m.loser_number;

-- These rows are derived from questionnaire content. Removing every cache row
-- involving an affected account prevents stale scores after the survey merge.
delete from public.compatibility_cache
where participant_a_number in (select assigned_number from _merge_ranked)
   or participant_b_number in (select assigned_number from _merge_ranked);

delete from public.compatibility_cache_groups
where participant_a_number in (select assigned_number from _merge_ranked)
   or participant_b_number in (select assigned_number from _merge_ranked);

delete from public.participant_embeddings
where participant_number in (select assigned_number from _merge_ranked);

-- Remove only post-merge duplicate exclusion rows, after their complete rows
-- have been backed up. Non-conflicting exclusions are retained and repointed.
delete from public.excluded_pairs e
using (
  select id
  from (
    select
      e2.id,
      row_number() over (
        partition by
          e2.match_id,
          least(
            coalesce(m1.survivor_number, e2.participant1_number),
            coalesce(m2.survivor_number, e2.participant2_number)
          ),
          greatest(
            coalesce(m1.survivor_number, e2.participant1_number),
            coalesce(m2.survivor_number, e2.participant2_number)
          )
        order by
          ((m1.loser_number is null)::integer + (m2.loser_number is null)::integer) desc,
          e2.id desc
      ) as rn
    from public.excluded_pairs e2
    left join _merge_map m1 on m1.loser_number = e2.participant1_number
    left join _merge_map m2 on m2.loser_number = e2.participant2_number
  ) ranked_pairs
  where rn > 1
) duplicates
where e.id = duplicates.id;

update public.excluded_pairs e
set
  participant1_number = coalesce(
    (select survivor_number from _merge_map where loser_number = e.participant1_number),
    e.participant1_number
  ),
  participant2_number = coalesce(
    (select survivor_number from _merge_map where loser_number = e.participant2_number),
    e.participant2_number
  )
where e.participant1_number in (select loser_number from _merge_map)
   or e.participant2_number in (select loser_number from _merge_map);

-- Repoint every other UUID/assigned-number reference. This includes previous
-- matches, feedback, attendance, receipts, rankings, WhatsApp, Twilio actions,
-- event sessions, and survey edit history.
do $move$
declare
  rec record;
begin
  for rec in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in (
        'participants',
        'compatibility_cache',
        'compatibility_cache_groups',
        'participant_embeddings',
        'excluded_pairs',
        'participant_account_merge_batches',
        'participant_account_merge_log',
        'participant_account_merge_backup'
      )
      and (
        c.column_name in (
          'participant_id', 'participant_number', 'assigned_number',
          'ranker_number', 'ranked_number', 'about_number',
          'participant_a_id', 'participant_b_id',
          'participant_a_number', 'participant_b_number',
          'participant_c_number', 'participant_d_number',
          'participant_e_number', 'participant_f_number',
          'participant1_number', 'participant2_number',
          'phase2_partner', 'phase3_partner'
        )
        or c.column_name ~* '^participant_[a-z]_number$'
      )
      and c.data_type in ('uuid', 'integer', 'bigint')
    order by c.table_name, c.ordinal_position
  loop
    if rec.data_type = 'uuid' then
      execute format(
        'update public.%I t set %I = m.survivor_id
         from _merge_map m where t.%I = m.loser_id',
        rec.table_name,
        rec.column_name,
        rec.column_name
      );
    else
      execute format(
        'update public.%I t set %I = m.survivor_number
         from _merge_map m where t.%I = m.loser_number',
        rec.table_name,
        rec.column_name,
        rec.column_name
      );
    end if;
  end loop;
end
$move$;

-- Add an explicit, non-destructive marker to the ordinary survey edit history.
insert into public.survey_change_history(
  participant_number,
  match_id,
  changed_at,
  previous_answers,
  new_answers,
  changed_fields,
  change_percentage,
  suspicious_flags
)
select
  g.survivor_number,
  p.match_id,
  now(),
  jsonb_build_object('merged_account_numbers', to_jsonb(g.merged_numbers)),
  jsonb_build_object(
    'survivor_number', g.survivor_number,
    'merge_batch_id', (select id from _merge_batch),
    'survey_strategy', 'latest_value_per_answer_key'
  ),
  array['__account_merge__']::text[],
  0,
  jsonb_build_array('administrative_account_merge')
from _merge_groups g
join public.participants p on p.id = g.survivor_id;

delete from public.participants p
using _merge_map m
where p.id = m.loser_id;

-- Any failed assertion aborts and rolls back the complete transaction.
do $verify$
declare
  remaining_mergeable_groups integer;
  remaining_losers integer;
  logged_merges integer;
  exempt_accounts integer;
begin
  with current_normalized as (
    select
      id,
      case
        when regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') like '00966%'
          then substring(regexp_replace(phone_number, '\D', '', 'g') from 3)
        when regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') ~ '^05[0-9]{8}$'
          then '966' || substring(regexp_replace(phone_number, '\D', '', 'g') from 2)
        when regexp_replace(coalesce(phone_number, ''), '\D', '', 'g') ~ '^5[0-9]{8}$'
          then '966' || regexp_replace(phone_number, '\D', '', 'g')
        else regexp_replace(coalesce(phone_number, ''), '\D', '', 'g')
      end as canonical_phone
    from public.participants
  )
  select count(*) into remaining_mergeable_groups
  from (
    select canonical_phone
    from current_normalized
    where length(canonical_phone) >= 9
      and canonical_phone not in (select canonical_phone from _merge_exempt_phones)
    group by canonical_phone
    having count(*) > 1
  ) remaining;

  select count(*) into remaining_losers
  from public.participants p
  join _merge_map m on m.loser_id = p.id;

  select count(*) into logged_merges
  from public.participant_account_merge_log
  where batch_id = (select id from _merge_batch);

  select count(*) into exempt_accounts
  from public.participants
  where assigned_number in (1466, 150, 420, 7);

  if remaining_mergeable_groups <> 0
     or remaining_losers <> 0
     or logged_merges <> (select count(*) from _merge_map)
     or exempt_accounts <> 4 then
    raise exception
      'Participant merge verification failed: duplicate_groups=%, losers=%, logged=%, exempt_accounts=%',
      remaining_mergeable_groups,
      remaining_losers,
      logged_merges,
      exempt_accounts;
  end if;
end
$verify$;

select
  b.id as batch_id,
  (select count(*) from _merge_groups) as merged_phone_groups,
  (select count(*) from _merge_map) as removed_accounts,
  (select count(*) from _merge_groups where survey_base_id <> survivor_id) as surveys_based_on_another_account,
  (select count(*) from public.participant_account_merge_backup where batch_id = b.id) as backed_up_rows,
  (select count(*) from public.survey_change_history h
    where h.changed_fields = array['__account_merge__']::text[]
      and h.new_answers->>'merge_batch_id' = b.id::text) as merge_history_markers,
  (select count(*) from public.participants) as remaining_participants
from _merge_batch b;

commit;
