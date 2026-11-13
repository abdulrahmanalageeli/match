-- Give the interview service the account's trusted signup gender so Arabic
-- questions and quick replies use consistent grammatical agreement.
alter function nisfayn_ai.interview(text, jsonb, text)
  rename to interview_before_member_gender;

create function nisfayn_ai.interview(
  command text,
  payload jsonb default '{}'::jsonb,
  test_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  member uuid;
  actor_name text;
  member_gender text;
begin
  result := nisfayn_ai.interview_before_member_gender(command, payload, test_token);

  if coalesce(test_token, '') <> '' then
    select actor
      into actor_name
      from nisfayn_test.sessions
     where token_hash = sha256(test_token::bytea)
       and expires_at > now();

    member_gender := case actor_name
      when 'reham' then 'woman'
      when 'abdulrahman' then 'man'
      else null
    end;
  else
    member := marriage.require_member();

    select coalesce(
      (select p.gender
         from marriage.profiles p
        where p.member_id = member),
      (select d.document #>> '{answers,gender}'
         from marriage.onboarding_drafts d
        where d.member_id = member)
    )
      into member_gender;
  end if;

  if member_gender in ('woman', 'man') then
    result := result || jsonb_build_object('memberGender', member_gender);
  end if;

  return result;
end;
$$;

revoke all on function nisfayn_ai.interview_before_member_gender(text, jsonb, text) from public, anon, authenticated;
revoke all on function nisfayn_ai.interview(text, jsonb, text) from public;
grant execute on function nisfayn_ai.interview(text, jsonb, text) to anon, authenticated;
