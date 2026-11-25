-- Opening or refreshing a conversation only reads the latest committed agreement.
-- Decisions still use the serialized writer, including its check of the proposal ID.
create or replace function marriage.agreement(request_id uuid, action text default 'read', payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  me uuid;
  mine text;
  other text;
  current_id text;
begin
  if action = 'read' then
    me := marriage.require_member();
    select coalesce(a.data, '{"status":"none"}'::jsonb) || jsonb_build_object(
      'actor', case when my_profile.gender='woman' then 'reham' else 'abdulrahman' end,
      'mineName', my_profile.display_name, 'peerName', peer_profile.display_name)
    into v
    from marriage.member_requests r
    join marriage.profiles my_profile on my_profile.member_id=me
    join marriage.profiles peer_profile on peer_profile.member_id =
      case when me=r.requester_id then r.recipient_id else r.requester_id end
    left join marriage.conversation_agreements a on a.request_id=r.id
    where r.id=$1 and me in (r.requester_id,r.recipient_id)
      and r.status='accepted' and marriage.compatible(r.requester_id,r.recipient_id);
    if not found then
      raise exception 'المحادثة غير متاحة.' using errcode='42501';
    end if;
  elsif action in ('family','family_propose','family_accept','family_clear') then
    v := marriage.agreement_before_revocation($1,'read','{}');
    mine := v->>'actor';
    other := case mine when 'reham' then 'abdulrahman' else 'reham' end;
    current_id := v->>'familyProposalId';
    if action='family' then raise exception 'حدّث التطبيق وراجع طلب التواصل العائلي.'; end if;
    if action='family_propose' and v->>'status'='accepted' and current_id is null and payload->'confirmed'='true'::jsonb then
      v := v||jsonb_build_object('familyProposalId',gen_random_uuid(),'familyAgreed',jsonb_build_object(mine,true));
    elsif action='family_accept' and v->>'status'='accepted' and current_id is not null and payload->>'proposalId'=current_id and v#>>array['familyAgreed',other]='true' and payload->'confirmed'='true'::jsonb then
      v := (v-'extension')||jsonb_build_object('familyAgreed',jsonb_build_object(mine,true,other,true),'status','family');
    elsif action='family_clear' and current_id is not null and payload->>'proposalId'=current_id then
      v := (v-'familyProposalId'-'familyAgreed')||jsonb_build_object('status','accepted');
    else
      raise exception 'تغيّر طلب التواصل العائلي. راجع الحالة الحالية.';
    end if;
    update marriage.conversation_agreements a set data=v-'actor'-'mineName'-'peerName' where a.request_id=$1;
  else
    v := marriage.agreement_before_revocation($1,action,payload);
  end if;
  if v->>'status'='accepted' and (v->>'deadline')::timestamptz<=clock_timestamp() then
    v := v||'{"status":"expired"}'::jsonb;
  end if;
  return v;
end $$;
