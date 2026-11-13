-- Disambiguate JSON set aliases from the PL/pgSQL loop variable p.
do $migration$
declare definition text;updated text;begin
 definition:=pg_get_functiondef('marriage.interview_document_valid(jsonb)'::regprocedure);
 updated:=replace(definition,$old$jsonb_array_elements(doc->arr) p cross join lateral jsonb_array_elements(p->'evidence') e where left(e->>'turnId',8)='context:' and e->>'turnId'<>'context:'||(p->>'id')$old$,$new$jsonb_array_elements(doc->arr) captured cross join lateral jsonb_array_elements(captured->'evidence') e where left(e->>'turnId',8)='context:' and e->>'turnId'<>'context:'||(captured->>'id')$new$);
 if updated=definition then raise exception 'Expected context identity clause missing';end if;
 definition:=updated;
 updated:=replace(definition,$old$jsonb_array_elements(doc->arr) p cross join lateral jsonb_array_elements(p->'evidence') e where left(e->>'turnId',8)='context:' and e->>'quote'<>replace((p->'values')::text,' ','')$old$,$new$jsonb_array_elements(doc->arr) captured cross join lateral jsonb_array_elements(captured->'evidence') e where left(e->>'turnId',8)='context:' and e->>'quote'<>replace((captured->'values')::text,' ','')$new$);
 if updated=definition then raise exception 'Expected context values clause missing';end if;
 execute updated;
end $migration$;
