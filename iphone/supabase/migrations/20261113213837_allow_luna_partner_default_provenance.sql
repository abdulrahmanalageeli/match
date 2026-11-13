-- Partner defaults are explicit, editable suggestions derived from a member's
-- own confirmed answer. The API keeps their source so the review can explain
-- the inference, but the previous database validator predates that metadata.
alter function marriage.interview_document_valid(jsonb)
  rename to interview_document_valid_before_partner_defaults;

create function marriage.interview_document_valid(doc jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  arr text;
  item jsonb;
  sanitized jsonb := doc;
begin
  if jsonb_typeof(doc) is distinct from 'object' then return false; end if;

  foreach arr in array array['proposals','confirmed'] loop
    if jsonb_typeof(doc->arr) is distinct from 'array' then return false; end if;

    for item in select value from jsonb_array_elements(doc->arr) loop
      if item ? 'source' and (
        item->>'source' is distinct from 'self_default'
        or item->>'side' is distinct from 'partner'
        or coalesce(item->>'kind','') not in ('preference','beena')
      ) then return false; end if;
    end loop;

    sanitized := jsonb_set(
      sanitized,
      array[arr],
      coalesce((
        select jsonb_agg(value - 'source')
        from jsonb_array_elements(doc->arr)
      ), '[]'::jsonb)
    );
  end loop;

  return marriage.interview_document_valid_before_partner_defaults(sanitized);
exception when others then
  return false;
end $$;

revoke all on function marriage.interview_document_valid(jsonb),
  marriage.interview_document_valid_before_partner_defaults(jsonb)
  from public,anon,authenticated,service_role;
