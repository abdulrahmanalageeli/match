insert into public.twilio_templates
  (template_key, friendly_name, description, content_sid, category, language, content_type, approval_status, body_text, variables, buttons, enabled, sort_order)
values
  (
    'survey_update',
    'copy_of_complete_new_survey_questions',
    'Prompts participants to complete the five new compatibility questions.',
    'HX29303de3e62bac314552ee3056578c4f',
    'UTILITY',
    'ar',
    'twilio/call-to-action',
    'approved',
    '✨ *تحديث استبيان التوافق*

أهلاً وسهلاً {{1}} 🤍

حدّثنا استبيان *التوافق الأعمى*، واختصرناه مع إضافة أسئلة قصيرة تساعدنا نفهمك بشكل أدق ونحسّن اختيار توافقك القادم.

*ما تحتاج تعيد الاستبيان كامل.*
ادخل على حسابك من الزر أدناه، وبتظهر لك الأسئلة الجديدة مباشرة.

إجاباتك المحدثة بتدخل في حساب التوافق القادم، وإذا ما كملتها بنعتمد على إجاباتك السابقة.

كل إجابة تساعدنا نقرّب أكثر من الشخص الأنسب لك ✨

— *فريق التوافق الأعمى*',
    '[{"key":"1","label":"Participant name"}]'::jsonb,
    '[{"title":"إكمال الإستبيان","type":"url","url":"https://blindmatch.app/"}]'::jsonb,
    true,
    85
  )
on conflict (template_key) do update set
  friendly_name = excluded.friendly_name,
  description = excluded.description,
  content_sid = excluded.content_sid,
  category = excluded.category,
  language = excluded.language,
  content_type = excluded.content_type,
  approval_status = excluded.approval_status,
  body_text = excluded.body_text,
  variables = excluded.variables,
  buttons = excluded.buttons,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  updated_at = now();
