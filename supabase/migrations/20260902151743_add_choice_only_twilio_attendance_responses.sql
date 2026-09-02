insert into public.twilio_response_rules
  (action_key, label, trigger_payload, response_text, description, enabled, sort_order)
values
  (
    'attendance_payment_pending_choice_only',
    'Attendance confirmed — choice-only payment required',
    'confirm_attendance',
    E'🎉 *باقي خطوة واحدة لتأكيد مقعدك!*\n\n✨ *نسخة الاختيارات فقط*\nهذا الحجز يخص *التوافق الأعمى 5.0 — نسخة الاختيارات فقط*، وليس تجربة «اختيارك واختيارنا» المعتادة.\n\nستشارك في *3 جولات جماعية*، ثم تختار من ترغب بمقابلتهم. بعد ذلك تُرتب لك *3 لقاءات فردية* مع ثلاثة أشخاص مختلفين وفق أقوى الاختيارات المتبادلة. لا تستخدم هذه النسخة ترشيح الخوارزمية للقاءات الفردية.\n\n*بإتمام التحويل وإرسال الإيصال، فأنت تؤكد حجزك في هذه النسخة تحديداً.*\n\nرقم مشاركتك: *{participant_number}*\nالسعر المستحق الآن: *{price} ريال* ({price_label})\n\n💡 *السعر المبكر:* {early_price} ريال — {early_time}\n⏰ *السعر المتأخر:* {late_price} ريال — {late_time}\n\n💳 *بيانات التحويل*\n• STC Pay: {stc_pay}\n• {bank_name}\n• IBAN: {iban}\n\n*يُحجز مقعدك فقط بعد الدفع وإرسال الإيصال.* ادفع الآن لتأكيد مقعدك قبل اكتمال المقاعد، ثم أرسل الإيصال هنا كصورة واضحة أو PDF.',
    'Explains the choice-only edition before asking a participant to pay for it.',
    true,
    11
  ),
  (
    'attendance_paid_choice_only',
    'Attendance confirmed — choice-only already paid',
    'confirm_attendance',
    E'🎉 *مقعدك مؤكد في نسخة الاختيارات فقط!*\n\nتم اعتماد دفعتك وتأكيد حضورك في *التوافق الأعمى 5.0 — نسخة الاختيارات فقط*.\n\nتذكير: ستشارك في *3 جولات جماعية*، ثم *3 لقاءات فردية* تُحسم وفق أقوى الاختيارات المتبادلة، من دون ترشيح الخوارزمية للقاءات الفردية. ستجد أدناه المكان والوقت ورابط شرح التجربة قبل الحضور.',
    'Confirms a previously paid participant in the choice-only edition.',
    true,
    21
  ),
  (
    'attendance_waived_choice_only',
    'Attendance confirmed — choice-only payment waived',
    'confirm_attendance',
    E'🎉 *مقعدك مؤكد في نسخة الاختيارات فقط!*\n\nتم تأكيد حضورك مع إعفاء الدفع في *التوافق الأعمى 5.0 — نسخة الاختيارات فقط*.\n\nتذكير: ستشارك في *3 جولات جماعية*، ثم *3 لقاءات فردية* تُحسم وفق أقوى الاختيارات المتبادلة، من دون ترشيح الخوارزمية للقاءات الفردية. ستجد أدناه المكان والوقت ورابط شرح التجربة قبل الحضور.',
    'Confirms a payment-waived participant in the choice-only edition.',
    true,
    31
  )
on conflict (action_key) do update
set label = excluded.label,
    trigger_payload = excluded.trigger_payload,
    response_text = excluded.response_text,
    description = excluded.description,
    enabled = excluded.enabled,
    sort_order = excluded.sort_order,
    updated_at = now();
