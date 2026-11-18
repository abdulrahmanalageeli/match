alter table marriage.profiles add column discovery_line text
  check (char_length(discovery_line) between 1 and 1200);

-- Select only complete sentences from fields already visible in this projection.
create function marriage.has_discovery_line(story jsonb, line text) returns boolean
language sql immutable strict set search_path='' as $$
  select exists (
    select 1 from unnest(array['bio','lifeTogether','valuesStatement','lookingFor']) as f(key)
    cross join lateral regexp_matches(story->>f.key, E'[^.!?؟…\r\n]+[.!?؟…]*', 'g') as m(parts)
    where regexp_replace(m.parts[1], '^[[:space:]]+|[[:space:]]+$', '', 'g') = line
  )
$$;

-- Add the line before the existing approval snapshot is taken. A member awaiting
-- review continues to show the previous approved story and its previous selection.
alter function marriage.member_card_before_profile_lifecycle(uuid,uuid) rename to member_card_before_discovery_line;
create function marriage.member_card_before_profile_lifecycle(viewer uuid, subject uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare card jsonb := marriage.member_card_before_discovery_line(viewer,subject); line text;
begin
  select discovery_line into line from marriage.profiles where member_id=subject;
  if line is not null and marriage.has_discovery_line(card,line) then
    return card || jsonb_build_object('discoveryLine',line);
  end if;
  return card;
end $$;

alter function marriage.profile_json(uuid) rename to profile_json_before_discovery_line;
create function marriage.profile_json(target uuid) returns jsonb language sql stable set search_path='' as $$
  select marriage.profile_json_before_discovery_line(target) ||
    coalesce((select jsonb_build_object('discoveryLine',discovery_line) from marriage.profiles
              where member_id=target and discovery_line is not null),'{}'::jsonb)
$$;

alter function marriage.apply_profile_before_lifecycle(jsonb) rename to apply_profile_before_discovery_line;
create function marriage.apply_profile_before_lifecycle(payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare me uuid := marriage.require_member(); result jsonb; line text; story jsonb;
begin
  result := marriage.apply_profile_before_discovery_line(payload - 'discoveryLine');
  story := marriage.profile_json(me);
  line := nullif(story->>'discoveryLine','');
  if payload ? 'discoveryLine' then
    line := nullif(payload->>'discoveryLine','');
    if line is not null and not marriage.has_discovery_line(story,line) then
      raise exception 'اختر جملة من النص المعروض في ملفك.' using errcode='22023';
    end if;
  elsif line is not null and not marriage.has_discovery_line(story,line) then
    line := null;
  end if;
  update marriage.profiles set discovery_line=line where member_id=me and discovery_line is distinct from line;
  return result;
end $$;

revoke all on function marriage.has_discovery_line(jsonb,text), marriage.profile_json(uuid),
  marriage.member_card_before_profile_lifecycle(uuid,uuid), marriage.apply_profile_before_lifecycle(jsonb),
  marriage.profile_json_before_discovery_line(uuid), marriage.member_card_before_discovery_line(uuid,uuid),
  marriage.apply_profile_before_discovery_line(jsonb) from public,anon,authenticated;

do $$
declare original text := pg_get_functiondef('marriage.onboarding_draft(text,jsonb)'::regprocedure);
begin
  if strpos(original,'''lookingFor'',''lifeTogether''')=0 then raise exception 'Unexpected draft allowlist'; end if;
  execute replace(original,'''lookingFor'',''lifeTogether''','''discoveryLine'',''lookingFor'',''lifeTogether''');
end $$;
