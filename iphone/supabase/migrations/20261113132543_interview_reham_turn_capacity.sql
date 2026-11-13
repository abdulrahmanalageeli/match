-- Storage accommodates a server-authorized account allowance. Runtime stays at
-- 48 turns for other accounts; no client-provided JSON can grant an allowance.
do $migration$
declare definition text;updated text;begin
 definition:=pg_get_functiondef('marriage.interview_document_valid_before_required(jsonb)'::regprocedure);
 updated:=replace(definition,'jsonb_array_length(doc->''turns'')>48','jsonb_array_length(doc->''turns'')>80');
 if updated=definition then raise exception 'Expected interview storage cap missing';end if;
 execute updated;
 definition:=pg_get_functiondef('nisfayn_ai.interview_before_receipts(text,jsonb,text)'::regprocedure);
 updated:=replace(definition,'where owner_key=owner and created_at>=today)>=40','where owner_key=owner and created_at>=today)>=(case when owner=''member:b3019f65-9462-4e12-9614-1127e8712a04'' then 80 else 40 end)');
 if updated=definition then raise exception 'Expected interview account daily quota missing';end if;
 execute updated;
end $migration$;
