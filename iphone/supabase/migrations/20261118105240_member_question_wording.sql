-- Current display labels can change while the versioned assessment remains an
-- exact record of the questionnaire under which earlier answers were collected.
update marriage.questions q set label = wording.label
from (values
  ('partner_family_authority', 'لو أراد الطرف الآخر إشراك أهله في قرار يخصّ بيتكما، وش الدور اللي يناسبك؟'),
  ('social_rhythm', 'بعد أسبوع مزدحم، كيف يناسبك تقضي وقتك بين الراحة والزيارات؟'),
  ('partner_social_rhythm', 'كيف يناسبك أن يوازن الطرف الآخر بين الزيارات ووقت الراحة؟'),
  ('mixed_gatherings', 'لو وصلتك دعوة لجمعة أصدقاء فيها رجال ونساء، وش يناسبك عادة؟')
) as wording(code, label)
where q.code = wording.code;

create or replace function marriage.catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select marriage.catalog_base() || jsonb_build_object('assessment',
    jsonb_set(v.catalog, '{dimensions}', (
      select jsonb_agg(d.value || jsonb_build_object(
        'selfPrompt', q.label, 'partnerPrompt', p.label,
        'discussion', case when d.value->>'discussion' = d.value->>'selfPrompt'
          then q.label else d.value->>'discussion' end
      ) order by d.position)
      from jsonb_array_elements(v.catalog->'dimensions') with ordinality d(value, position)
      join marriage.questions q on q.code = d.value->>'id'
      join marriage.questions p on p.code = d.value->>'partnerId'
    ))
  )
  from marriage.assessment_versions v where v.id = 'marriage-v3'
$$;
