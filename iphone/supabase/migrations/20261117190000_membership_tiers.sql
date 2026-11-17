-- Free approved members can browse and accept. Payment is required to initiate.
-- Keep receipt truth, session checks, consent, blocks and relationship gates intact.
do $gates$ declare name text; definition text; begin
 foreach name in array array['require_discovery_member','require_communication_member',
 'relationship_eligible','browse','discover','ranked_week','act_request','chat_peer',
 'inbox','mark_thread_read','message','unread_count','progress_peer','photo_can_read',
 'portrait_revealed','voice_allowed','family_member_active','gallery_access',
 'note_profile_open','discovery_action','request_history','push_allowed_before_reminders',
 'member_state_base','respond'] loop
  for definition in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='marriage' and p.proname=name and p.prokind='f' loop
   execute replace(replace(replace(definition,'marriage.is_paid(','marriage.relationship_member_allowed('),
    'ذوي الاشتراك الفعّال',''), 'وأن يكون الاشتراك ساريًا للمحادثات','للمحادثات');
  end loop;
 end loop;
end $gates$;

do $initiation$ declare definition text; begin
 definition:=pg_get_functiondef('marriage.request_member(uuid)'::regprocedure);
 if position('not marriage.is_paid(member_id)' in definition)=0 then raise exception 'Unexpected request gate';end if;
 execute replace(definition,'not marriage.is_paid(member_id)','not marriage.relationship_member_allowed(member_id)');
 definition:=pg_get_functiondef('marriage.guard_week_request()'::regprocedure);
 execute replace(definition,'not marriage.is_paid(new.recipient_id)','not marriage.relationship_member_allowed(new.recipient_id)');
 -- Interest notifications, reporting and hiding remain available to free members.
end $initiation$;

-- Default card responses (inbox, profile, notifications) never disclose paid
-- compatibility evidence to a free viewer. The recommended feed adds only its number.
alter function marriage.member_card(uuid,uuid) rename to member_card_before_tiers;
create function marriage.member_card(viewer uuid,subject uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare card jsonb:=marriage.member_card_before_tiers(viewer,subject);begin
 card:=card||jsonb_build_object('premium',marriage.is_paid(subject));
 if not marriage.is_paid(viewer) then card:=(card-'fit')||jsonb_build_object('reasons','[]'::jsonb,'compatibilityLocked',true);end if;
 return card;
end $$;
create function marriage.discovery_card(viewer uuid,subject uuid,recommended boolean) returns jsonb
language plpgsql stable set search_path='' as $$
declare card jsonb:=marriage.member_card(viewer,subject); f jsonb;begin
 if recommended and not marriage.is_paid(viewer) then
  select fit into f from marriage.pair_fit(viewer,subject);
  card:=card||jsonb_build_object('recommendationPercentage',case
   when (f->>'assessmentComplete')::boolean and not (f->>'provisional')::boolean
    and (f->>'total')::integer>0 and f->>'total'=f->>'covered' then f->'percentage' else null end);
 end if;
 return card;
end $$;
revoke all on function marriage.member_card(uuid,uuid),marriage.member_card_before_tiers(uuid,uuid),marriage.discovery_card(uuid,uuid,boolean) from public,anon,authenticated;

do $scores$ declare definition text;begin
 definition:=pg_get_functiondef('marriage.browse(jsonb)'::regprocedure);
 definition:=replace(definition,'marriage.member_card(me,member_id)','marriage.discovery_card(me,member_id,coalesce(options->>''mode'',''all'')=''recommended'')');
 -- Prevent probing a hidden score with repeated minFit queries.
 definition:=regexp_replace(definition,'foreach filter_key',E'if not marriage.is_paid(me) then options:=options-''minFit'';end if;\n foreach filter_key');
 execute definition;
 definition:=pg_get_functiondef('marriage.discover(integer,integer,text,uuid)'::regprocedure);
 execute replace(definition,'marriage.member_card(me,s.candidate_id)','marriage.discovery_card(me,s.candidate_id,true)');
end $scores$;

alter function marriage.member_state(uuid) rename to member_state_before_tiers;
create function marriage.member_state(target uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb:=marriage.member_state_before_tiers(target);begin
 if not marriage.is_paid(target) and result->'introduction'<>'null'::jsonb then
  result:=jsonb_set(result,'{introduction}',(result->'introduction'-'fit')||jsonb_build_object('reasons','[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function marriage.member_state(uuid),marriage.member_state_before_tiers(uuid) from public,anon,authenticated;
