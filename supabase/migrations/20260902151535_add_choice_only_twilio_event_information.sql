insert into public.twilio_response_rules
  (action_key, label, trigger_payload, response_text, description, enabled, sort_order)
values
  (
    'event_information_choice_only',
    'Event information — choice-only edition',
    'event3_information',
    E'✨ *التوافق الأعمى 5.0 | هذه المرة، أنتم تختارون*\n\nتبدأ التجربة بـ *3 جولات جماعية*، وفي كل جولة تتعرّف على مجموعة مختلفة.\n\nبعد الجولات سترتّب بسرية المشاركين الذين ترغب بمقابلتهم، ثم ننظّم لك *3 لقاءات فردية* مع ثلاثة أشخاص مختلفين وفق أقوى الاختيارات المتبادلة.\n\nلا تعيّن الخوارزمية شريكاً مسبقاً في هذه النسخة؛ اختياراتكم هي التي تحدد اللقاءات.\n\n📘 *شرح التجربة وخطوات يوم الفعالية:*\n{tutorial_url}\n\nخذ دقيقتين لقراءة الشرح قبل وصولك 🤍',
    'Sent from the event-information action when the active event uses the choice-only three-group format.',
    true,
    241
  )
on conflict (action_key) do update
set label = excluded.label,
    trigger_payload = excluded.trigger_payload,
    response_text = excluded.response_text,
    description = excluded.description,
    enabled = excluded.enabled,
    sort_order = excluded.sort_order,
    updated_at = now();
