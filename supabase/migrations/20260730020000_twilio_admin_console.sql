-- Twilio operations console: editable templates/replies, delivery telemetry,
-- participant action history, and event-day action state.

alter table public.whatsapp_messages
  add column if not exists status_updated_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists twilio_payload jsonb not null default '{}'::jsonb;

create unique index if not exists idx_wa_messages_twilio_sid
  on public.whatsapp_messages(twilio_message_sid)
  where twilio_message_sid is not null;
create index if not exists idx_wa_messages_status_created
  on public.whatsapp_messages(status, created_at desc);

alter table public.participants
  add column if not exists age_flex_years integer not null default 0,
  add column if not exists age_flex_event_id integer,
  add column if not exists arrival_status text,
  add column if not exists arrival_status_at timestamptz,
  add column if not exists discount_interest text,
  add column if not exists last_twilio_action text,
  add column if not exists last_twilio_action_at timestamptz;

do $$ begin
  alter table public.participants add constraint participants_age_flex_years_check
    check (age_flex_years between 0 and 10);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.participants add constraint participants_arrival_status_check
    check (arrival_status is null or arrival_status in ('on_way','late','cancelled','arrived'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.participants add constraint participants_discount_interest_check
    check (discount_interest is null or discount_interest in ('interested','declined'));
exception when duplicate_object then null; end $$;

create table if not exists public.twilio_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  friendly_name text not null,
  description text,
  content_sid text,
  category text not null default 'UTILITY' check (category in ('UTILITY','MARKETING','AUTHENTICATION')),
  language text not null default 'ar',
  content_type text not null default 'twilio/quick-reply',
  approval_status text not null default 'unsubmitted'
    check (approval_status in ('unsubmitted','received','pending','approved','rejected','paused','disabled')),
  rejection_reason text,
  body_text text not null default '',
  variables jsonb not null default '[]'::jsonb,
  buttons jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.twilio_response_rules (
  id uuid primary key default gen_random_uuid(),
  action_key text not null unique,
  label text not null,
  trigger_payload text,
  response_text text not null,
  description text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participant_twilio_actions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid references public.participants(id) on delete cascade,
  assigned_number integer,
  event_id integer not null default 1,
  action_key text not null,
  action_value jsonb not null default '{}'::jsonb,
  source text not null default 'participant' check (source in ('participant','admin','system')),
  message_id uuid references public.whatsapp_messages(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, event_id, action_key)
);

create index if not exists idx_twilio_actions_event_action
  on public.participant_twilio_actions(event_id, action_key, updated_at desc);
create index if not exists idx_twilio_actions_participant
  on public.participant_twilio_actions(participant_id, updated_at desc);

alter table public.twilio_templates enable row level security;
alter table public.twilio_response_rules enable row level security;
alter table public.participant_twilio_actions enable row level security;

revoke all on public.twilio_templates from anon, authenticated;
revoke all on public.twilio_response_rules from anon, authenticated;
revoke all on public.participant_twilio_actions from anon, authenticated;
grant select, insert, update, delete on public.twilio_templates to service_role;
grant select, insert, update, delete on public.twilio_response_rules to service_role;
grant select, insert, update, delete on public.participant_twilio_actions to service_role;

insert into public.twilio_templates
  (template_key, friendly_name, description, content_sid, category, approval_status, body_text, variables, buttons, sort_order)
values
  ('match', 'copy_of_match_notification_v2', 'Match notification and attendance response', 'HX6d318d6310d7cce0c37b1ef5e0b7a17e', 'MARKETING', 'approved', '',
   '[{"key":"1","label":"Participant name"},{"key":"2","label":"Early price"},{"key":"3","label":"Payment cutoff"},{"key":"4","label":"Late price"},{"key":"5","label":"STC Pay"},{"key":"6","label":"Bank"},{"key":"7","label":"IBAN"},{"key":"8","label":"Location"},{"key":"9","label":"Date"},{"key":"10","label":"Time"},{"key":"11","label":"Arrival"},{"key":"12","label":"Map URL"},{"key":"13","label":"Participant number"},{"key":"14","label":"Secure token"},{"key":"15","label":"Experience text"}]'::jsonb,
   '[{"title":"تأكيد المشاركة","id":"confirm_attendance"},{"title":"اعتذار عن المشاركة","id":"deny_attendance"},{"title":"التسجيل التلقائي","id":"toggle_auto_signup"},{"title":"معلومات الفعالية","id":"event3_information"}]'::jsonb, 10),
  ('reminder', 'event_reminder', 'Registered participant event reminder', null, 'UTILITY', 'unsubmitted', '',
   '[{"key":"1","label":"Participant name"},{"key":"2","label":"Event date"},{"key":"3","label":"Event time"},{"key":"4","label":"Location"},{"key":"5","label":"Map URL"}]'::jsonb,
   '[{"title":"تأكيد المشاركة","id":"confirm_attendance"},{"title":"اعتذار عن المشاركة","id":"deny_attendance"}]'::jsonb, 20),
  ('payment', 'payment_reminder', 'Pending payment reminder', null, 'UTILITY', 'unsubmitted', '',
   '[{"key":"1","label":"Participant name"},{"key":"2","label":"Early price"},{"key":"3","label":"Payment cutoff"},{"key":"4","label":"Late price"},{"key":"5","label":"Savings"},{"key":"6","label":"STC Pay"},{"key":"7","label":"Bank"},{"key":"8","label":"IBAN"}]'::jsonb,
   '[{"title":"تأكيد المشاركة","id":"confirm_attendance"},{"title":"اعتذار عن المشاركة","id":"deny_attendance"}]'::jsonb, 30),
  ('gender_preference', 'gender_preference_confirmation', 'Confirm participant gender preference', null, 'UTILITY', 'pending',
   'السلام عليكم *{{1}}* 👋\n\nنرغب في تأكيد تفضيلك لجنس الشريك قبل المطابقة.\n\nاختر أحد الخيارات التالية، وسنحدّث اختيارك مباشرة ونرسل لك تأكيداً.',
   '[{"key":"1","label":"Participant name"}]'::jsonb,
   '[{"title":"أي جنس","id":"gender_any"},{"title":"نفس الجنس","id":"gender_same"},{"title":"جنس مختلف","id":"gender_different"}]'::jsonb, 40),
  ('age_flexibility', 'age_preference_flexibility', 'Event-only age range flexibility', null, 'UTILITY', 'pending',
   'السلام عليكم *{{1}}* 👋\n\nوجدنا خيارات توافق جيدة لك، لكن نطاق العمر المحدد حالياً من *{{2}} إلى {{3}} سنة* يقلل عدد الخيارات المتاحة.\n\nهل تسمح بتوسيع نطاق العمر لهذه الفعالية فقط؟\n\nلن نغيّر تفضيلك الأساسي بشكل دائم دون موافقتك.',
   '[{"key":"1","label":"Participant name"},{"key":"2","label":"Minimum age"},{"key":"3","label":"Maximum age"}]'::jsonb,
   '[{"title":"توسيع سنتين","id":"age_expand_2"},{"title":"توسيع 5 سنوات","id":"age_expand_5"},{"title":"إبقاء النطاق","id":"age_keep_current"}]'::jsonb, 50),
  ('discount', 'discount_offer', 'Participant-specific event offer', null, 'MARKETING', 'pending',
   'السلام عليكم *{{1}}* 👋\n\nلدينا عرض خاص لك بقيمة *{{2}} ريال* للمشاركة في الفعالية القادمة.\n\nالعرض متاح حتى: {{3}}\n\nاختر أدناه إذا كنت مهتماً بالعرض.',
   '[{"key":"1","label":"Participant name"},{"key":"2","label":"Offer price"},{"key":"3","label":"Deadline"}]'::jsonb,
   '[{"title":"مهتم","id":"discount_interested"},{"title":"غير مهتم","id":"discount_declined"}]'::jsonb, 60),
  ('late_check', 'participant_late_check', 'Event-day late arrival check', null, 'UTILITY', 'pending',
   'السلام عليكم *{{1}}*،\n\nبدأ استقبال المشاركين ولم يتم تسجيل وصولك بعد.\n\nهل أنت في الطريق؟ يساعدنا ردك في المحافظة على مقعدك وتنظيم بداية اللقاء.',
   '[{"key":"1","label":"Participant name"}]'::jsonb,
   '[{"title":"في الطريق","id":"arrival_on_way"},{"title":"سأتأخر","id":"arrival_late"},{"title":"لن أحضر","id":"arrival_cancel"}]'::jsonb, 70),
  ('feedback_remaining', 'feedback_remaining_reminder', 'Reminder for feedback remaining on /welcome', null, 'UTILITY', 'pending',
   'السلام عليكم *{{1}}* 👋\n\nلديك *{{2}} تقييمات متبقية* من لقاءات فعالية *{{3}}*.\n\nنحتاج تقييمك لكل لقاء لتحسين نتائج التوافق وإكمال تجربتك.\n\nاضغط على الزر أدناه للعودة إلى صفحتك وإكمال التقييمات. شكراً لمشاركتك 🤍',
   '[{"key":"1","label":"Participant name"},{"key":"2","label":"Remaining feedback"},{"key":"3","label":"Event name"},{"key":"4","label":"Secure token (CTA URL)"}]'::jsonb,
   '[{"title":"إكمال التقييمات","type":"url","url":"https://blindmatch.app/welcome?token={{4}}"}]'::jsonb, 80)
on conflict (template_key) do nothing;

insert into public.twilio_response_rules
  (action_key, label, trigger_payload, response_text, description, sort_order)
values
  ('attendance_payment_pending', 'Attendance confirmed — payment required', 'confirm_attendance', '✅ تم تسجيل رغبتك بالحضور للمشارك رقم {participant_number}.\n\nلإكمال تأكيد المقعد، يرجى تحويل الرسوم المطلوبة وقدرها *{price} ريال* ({price_label}) ثم إرسال صورة الإيصال أو ملف PDF هنا.\n\n🏦 طرق الدفع:\n• STC Pay: {stc_pay}\n• {bank_name}\n• IBAN: {iban}\n\nيصبح المقعد مؤكداً نهائياً بعد مراجعة الإيصال.', 'Used when attendance is confirmed but payment is not approved.', 10),
  ('attendance_paid', 'Attendance confirmed — paid', 'confirm_attendance', '✅ تم تسجيل حضورك، ومقعدك مؤكد لأن دفعتك معتمدة.', 'Intro before final event details.', 20),
  ('attendance_waived', 'Attendance confirmed — waived', 'confirm_attendance', '✅ تم تسجيل حضورك، ومقعدك مؤكد بإعفاء من الدفع من المنظم.', 'Intro before final event details.', 30),
  ('attendance_denied', 'Attendance declined', 'deny_attendance', 'تم تسجيل اعتذاركم مباشرة 🙏 شكراً لكم، ونرحب بكم في فعاليات قادمة!', null, 40),
  ('gender_any', 'Gender preference — any', 'gender_any', '✅ تم تحديث تفضيلك إلى: *أي جنس*. سنعتمد هذا الاختيار في المطابقة القادمة.', null, 50),
  ('gender_same', 'Gender preference — same', 'gender_same', '✅ تم تحديث تفضيلك إلى: *نفس الجنس*. سنعتمد هذا الاختيار في المطابقة القادمة.', null, 60),
  ('gender_different', 'Gender preference — different', 'gender_different', '✅ تم تحديث تفضيلك إلى: *جنس مختلف*. سنعتمد هذا الاختيار في المطابقة القادمة.', null, 70),
  ('age_expand_2', 'Age flexibility — two years', 'age_expand_2', '✅ تم توسيع نطاق العمر بمقدار سنتين لهذه الفعالية فقط. لم نغيّر تفضيلك الأساسي.', null, 80),
  ('age_expand_5', 'Age flexibility — five years', 'age_expand_5', '✅ تم توسيع نطاق العمر بمقدار 5 سنوات لهذه الفعالية فقط. لم نغيّر تفضيلك الأساسي.', null, 90),
  ('age_keep_current', 'Age flexibility — unchanged', 'age_keep_current', '✅ تم الإبقاء على نطاق العمر الحالي بدون أي تغيير.', null, 100),
  ('discount_interested', 'Discount — interested', 'discount_interested', '✅ سجلنا اهتمامك بالعرض، وسيتابع معك المنظم قريباً.', null, 110),
  ('discount_declined', 'Discount — declined', 'discount_declined', 'تم تسجيل ردك، ولن نعتمد العرض لك. شكراً لإبلاغنا 🙏', null, 120),
  ('arrival_on_way', 'Arrival — on the way', 'arrival_on_way', '✅ تم تسجيل أنك في الطريق. سنحافظ على مقعدك، وننتظرك قريباً.', null, 130),
  ('arrival_late', 'Arrival — late', 'arrival_late', '✅ تم تسجيل أنك ستتأخر. إذا أمكن، أرسل وقت وصولك المتوقع برسالة.', null, 140),
  ('arrival_cancel', 'Arrival — cancelled', 'arrival_cancel', 'تم تسجيل أنك لن تتمكن من الحضور. شكراً لإبلاغنا حتى نتمكن من تنظيم المقاعد 🙏', null, 150),
  ('auto_signup_enabled', 'Automatic signup enabled', 'toggle_auto_signup', '✅ تم تفعيل الاشتراك التلقائي للفعاليات القادمة. سنراسلك عند توفر فعالية مناسبة، ولن يتم الخصم أو تأكيد الحضور دون موافقتك. لإيقافه أرسل كلمة: إيقاف', null, 160),
  ('auto_signup_already', 'Automatic signup already enabled', 'toggle_auto_signup', '✅ الاشتراك التلقائي مفعّل لديك بالفعل. لن نغيّر حالته. لإيقافه أرسل كلمة: إيقاف', null, 170),
  ('auto_signup_stopped', 'Automatic signup stopped', 'stop', '🛑 تم إيقاف الاشتراك التلقائي. لن نضيفك تلقائياً إلى الفعاليات القادمة.', null, 180),
  ('preference_kept', 'Preference unchanged', 'preference_keep', '✅ تم الإبقاء على تفضيلك الحالي بدون أي تغيير.', null, 190),
  ('receipt_received', 'Receipt received', null, '✅ استلمنا إيصال المشارك رقم {participant_number} بنجاح.\n\nحالته الآن: بانتظار المراجعة. سنرسل لك رسالة أخرى فور اعتماده وتأكيد المقعد.', null, 200),
  ('receipt_unsupported', 'Receipt file unsupported', null, 'تعذر قراءة المرفق كإيصال. أرسله من فضلك كصورة واضحة أو ملف PDF.', null, 210),
  ('receipt_store_failed', 'Receipt storage failed', null, '⚠️ لم نتمكن من حفظ الإيصال، لذلك لم يُسجّل بعد. يرجى إرساله مرة أخرى كصورة واضحة أو PDF. إذا تكرر الخطأ تواصل معنا على 0560899666.', null, 220),
  ('unknown_message', 'Unrecognized message help', null, 'مرحباً 👋\n\n• أرسل «تأكيد» لتسجيل رغبتك بالحضور\n• أرسل «اعتذار» إذا لن تتمكن من الحضور\n• أرسل الإيصال كصورة أو PDF ليُراجع ويُعتمد\n• أرسل «إيقاف» لإلغاء الاشتراك التلقائي\n\nتأكيد المقعد النهائي يصلك برسالة منفصلة بعد اعتماد الإيصال.', null, 230)
on conflict (action_key) do nothing;

insert into public.twilio_response_rules
  (action_key, label, trigger_payload, response_text, description, sort_order)
values
  ('event_information', 'Event information', 'event3_information', '📋 *معلومات حول الفعالية*\n\n✦ الفعالية: التوافق الأعمى 4.0\n✦ نظام توافق شخصي متقدم\n✦ مطابقة ذكية بناءً على شخصيتك واهتماماتك\n\nللاستفسار أكثر، تواصل مع المنظم عبر الواتساب: 0560899666\n\nفريق التوافق الأعمى', null, 240),
  ('receipt_unknown_phone', 'Receipt from unknown number', null, 'لم نتمكن من ربط هذا الرقم بتسجيل مشارك. يرجى إرسال الإيصال من الرقم المسجل أو التواصل معنا على 0560899666.', null, 250),
  ('auto_signup_already_stopped', 'Automatic signup already stopped', 'stop', 'الاشتراك التلقائي متوقف لديك بالفعل، ولم نغيّر أي شيء.', null, 260),
  ('final_event_details', 'Final event details', null, '📘 *شرح الفعالية قبل الحضور:*\n{tutorial_url}\n\n📍 *المكان:* {location}\n🗺️ {map_url}\n📅 *التاريخ:* {event_date}\n🕰️ *الوقت:* {event_time}{arrival_suffix}\n\nيرجى قراءة الشرح قبل الوصول. نراك هناك! 🤍', 'Appended after paid/waived/receipt-approved confirmations.', 270),
  ('receipt_approved', 'Receipt approved', null, '✅ تم تأكيد استلام الإيصال والموافقة عليه! حجزك مؤكد للفعالية.', null, 280),
  ('seat_waived_admin', 'Seat confirmed without payment by organizer', null, '✅ تم تأكيد مقعدك من المنظم بدون الحاجة إلى دفع.', null, 290),
  ('receipt_rejected_reason', 'Receipt rejected with reason', null, '⚠️ تعذّر قبول الإيصال. السبب: {reason}. يرجى إرسال إيصال صحيح.', null, 300),
  ('receipt_rejected_generic', 'Receipt rejected without reason', null, '⚠️ تعذّر قبول الإيصال. يرجى التأكد من وضوح الإيصال وإعادة إرساله.', null, 310)
on conflict (action_key) do nothing;
