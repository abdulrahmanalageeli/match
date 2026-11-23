-- The same consent check rejects old forms and incomplete current forms.
-- Explain which case applies before the verified SMS proof is consumed.
do $migration$
declare
  original text := pg_get_functiondef('marriage.complete_social_onboarding(text,text,jsonb)'::regprocedure);
  old_error text := $old$raise exception 'أكمل الموافقات المطلوبة.' using errcode='42501';$old$;
  new_error text := $new$raise exception using errcode='42501', message=case
    when consent @> '{"version":"2026-11-07-privacy","adult":true,"terms":true,"privacy":true,"sms":true}'::jsonb
      and (not (consent ? 'registrationVersion') or consent->>'registrationVersion' in ('wudayn-entry-2026-11-23','wudayn-entry-2026-11-23-v2'))
    then 'هذه النسخة من وُدَين تعرض اتفاق العضوية السابق. يلزم إصدار أحدث لإكمال التسجيل.'
    else 'أكمل الموافقات المطلوبة.' end;$new$;
begin
  if strpos(original,old_error)=0 then raise exception 'Social signup consent error not found'; end if;
  execute replace(original,old_error,new_error);
end $migration$;
