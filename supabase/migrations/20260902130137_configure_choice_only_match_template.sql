update public.twilio_templates
set
  friendly_name = 'blind_match_5_choice_only_nomination',
  description = 'Choice-only event nomination with three group rounds followed by up to three mutual individual meetings.',
  content_sid = 'HX7c190833f357e2f6f2ed0c9e906b6517',
  language = 'ar',
  content_type = 'twilio/quick-reply',
  approval_status = 'approved',
  body_text = '✨ *التوافق الأعمى 5.0 | هذه المرة، أنتم تختارون* أهلاً وسهلاً {{1}} 🤍 بعد معالجة طلبك رقم *{{2}}*، تم تأكيد ترشيحك لهذه الفعالية. سيكون ترتيب مشاركتك كالتالي: 👥 *3 جولات جماعية* سيتم توزيعك على مجموعة مختلفة في كل جولة. 📝 *بعد الجولات* سيُطلب منك تحديد المشاركين الذين ترغب بمقابلتهم بشكل فردي. 🤝 *3 لقاءات فردية* سيتم ترتيب اللقاءات وفق اختيارات المشاركين وتقاطعها. 📍 *تفاصيل اللقاء* 🗓️ {{3}} 🕰️ البداية: {{4}} ⏱️ الحضور: {{5}} 🏠 {{6}} 🗺️ *رابط الموقع* {{7}} أكد حضورك أو أخبرنا باعتذارك من الخيارات أدناه. سيُسجّل قرارك مباشرة، ويمكنك تغييره لاحقاً. — *فريق التوافق الأعمى*',
  variables = '[
    {"key":"1","label":"Participant name"},
    {"key":"2","label":"Participant number"},
    {"key":"3","label":"Event date"},
    {"key":"4","label":"Event start time"},
    {"key":"5","label":"Arrival time"},
    {"key":"6","label":"Location"},
    {"key":"7","label":"Map URL"}
  ]'::jsonb,
  enabled = true,
  updated_at = now()
where template_key = 'match';

-- Keep the match template's existing quick-reply buttons and action IDs.
