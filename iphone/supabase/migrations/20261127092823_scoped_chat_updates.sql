-- Keep the legacy event on the existing private member channels. An insert
-- identifies a row to read through the authorized RPC; deletion and access
-- changes still invalidate the whole view, including historical reply excerpts.
create or replace function marriage.signal_community_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare a uuid; b uuid; signal jsonb := '{}';
begin
  if tg_table_name='thread_messages' then
    select requester_id,recipient_id into strict a,b from marriage.member_requests where id=new.request_id;
    if tg_op='INSERT' then
      signal:=jsonb_build_object('kind','message','requestId',new.request_id,'messageId',new.id);
    end if;
  else
    a:=new.requester_id;
    b:=new.recipient_id;
  end if;
  begin
    perform realtime.send(signal,'changed','marriage:member:'||a::text,true);
    perform realtime.send(signal,'changed','marriage:member:'||b::text,true);
  exception when others then
    raise log 'Nisfayn realtime notification deferred (SQLSTATE %)', sqlstate;
  end;
  return new;
end $$;

-- Only replace the wake-up payload. Preserve the currently installed agreement
-- gates, entitlement checks, delivery semantics and execution grants.
do $$
declare spec record; original text; updated text;
begin
  for spec in select * from (values
    ('marriage.set_typing(uuid,boolean)', '''{}''::jsonb', 'jsonb_build_object(''kind'',''typing'',''requestId'',$1)'),
    ('marriage.mark_thread_read(uuid,uuid)', '''{}''::jsonb', 'jsonb_build_object(''kind'',''ownRead'',''requestId'',$1)'),
    ('marriage.notify_chat_reader_advanced()', '''{}''', 'jsonb_build_object(''kind'',''receipt'',''requestId'',new.request_id)'),
    ('marriage.record_device_delivery(uuid,uuid,uuid[])', '''{}''', 'jsonb_build_object(''kind'',''receipt'',''requestId'',thread_id)')
  ) as s(signature,old_payload,new_payload)
  loop
    original:=pg_get_functiondef(spec.signature::regprocedure);
    updated:=replace(original,'realtime.send('||spec.old_payload||',''changed''','realtime.send('||spec.new_payload||',''changed''');
    if original=updated then raise exception 'Expected chat signal in %', spec.signature; end if;
    execute updated;
  end loop;
end $$;
