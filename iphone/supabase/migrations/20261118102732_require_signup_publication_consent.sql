-- Apply the registration policy under the existing member lock. Profile edits
-- continue through the normal consent and publication-withdrawal path.
create or replace function marriage.apply_profile_before_answer_provenance(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := marriage.require_member();
begin
  perform 1 from marriage.members where id = me for update;
  if not exists (select 1 from marriage.profiles where member_id = me) then
    if payload->>'gender' = 'man' and not marriage.has_onboarding_portrait(me) then
      raise exception 'أضف صورة واضحة وتحقّق منها أو أرسلها للمراجعة قبل إرسال ملفك.' using errcode = '22023';
    end if;
    if marriage.required_onboarding_answers(payload) is not true then
      raise exception 'أكمل جميع إجابات التوافق والشخصية قبل إرسال ملفك.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from marriage.interview_receipts r join marriage.interview_sessions s using (owner_key)
      where r.owner_key = 'member:' || me::text and s.expires_at > now()
      and (r.fallback_at is not null or (r.completed_at is not null and s.document->>'status' = 'confirmed'
        and r.analysis_fingerprint = md5(jsonb_build_array(s.document->'turns', s.document->'proposals')::text)))
    ) then
      raise exception 'أكمل جلسة التوافق واعتمد إجاباتك قبل إرسال الملف.' using errcode = '22023';
    end if;
    if payload #> '{signupConsents,sensitiveProfile}' is distinct from 'true'::jsonb
      or payload #> '{signupConsents,sensitivePublication}' is distinct from 'true'::jsonb then
      raise exception 'راجع ووافق على معالجة التفاصيل الحساسة وعرضها لإكمال التسجيل.' using errcode = '22023';
    end if;
    if coalesce(payload #>> '{marriageBasics,skinTone}', '') !~ '^tone_[1-8]$' then
      raise exception 'اختر درجة البشرة الأقرب لك.' using errcode = '22023';
    end if;
  end if;
  return marriage.apply_profile_before_required_assessment(payload);
end $$;
