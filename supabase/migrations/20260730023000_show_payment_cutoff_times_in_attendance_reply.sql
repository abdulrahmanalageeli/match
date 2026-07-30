update public.twilio_response_rules
set response_text = '🎉 *باقي خطوة واحدة لتأكيد مقعدك!*

رقم مشاركتك: *{participant_number}*
السعر المستحق الآن: *{price} ريال* ({price_label})

💡 *السعر المبكر:* {early_price} ريال — {early_time}
⏰ *السعر المتأخر:* {late_price} ريال — {late_time}

💳 *بيانات التحويل*
• STC Pay: {stc_pay}
• {bank_name}
• IBAN: {iban}

*يُحجز مقعدك فقط بعد الدفع وإرسال الإيصال.* ادفع الآن لتأكيد مقعدك قبل اكتمال المقاعد، ثم أرسل الإيصال هنا كصورة واضحة أو PDF.',
    updated_at = now()
where action_key = 'attendance_payment_pending';
