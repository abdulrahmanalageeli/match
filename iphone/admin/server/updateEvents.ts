export const updateEvents = {
  'agreement:proposed': ['ميثاق التعارف بانتظار توقيعك', 'agreement', 'step'],
  'agreement:signed': ['اكتمل توقيع ميثاق التعارف', 'agreement', 'step'],
  'agreement:extension': ['لديك طلب لتمديد مدة التعارف', 'agreement', 'step'],
  'agreement:extended': ['تم تمديد مدة التعارف', 'agreement', 'step'],
  'agreement:expired': ['انتهت مدة التعارف', 'agreement', 'silent'],
  'agreement:family_invited': ['لديك دعوة للانتقال إلى التواصل العائلي', 'agreement', 'step'],
  'agreement:family_confirmed': ['تم الاتفاق على التواصل العائلي', 'agreement', 'step'],
  'journey:invited': ['لديك خطوة بانتظار قرارك', 'journey', 'step'],
  'journey:confirmed': ['تم الاتفاق على الخطوة التالية', 'journey', 'step'],
  'rematch:invited': ['لديك طلب لاستئناف التعارف', 'request', 'step'],
  'family_link:pending': ['لديك طلب ربط في جسر الأهل', 'family', 'step'],
  'family_link:active': ['اكتمل الربط في جسر الأهل', 'family', 'step'],
  'family_link:reviewed': ['لديك تحديث على طلب الربط العائلي', 'family', 'account'],
  'family_link:expired': ['انتهت صلاحية رابط جسر الأهل', 'family', 'silent'],
  'missed_call:received': ['لديك مكالمة فائتة', 'chat', 'message'],
  'analysis:review': ['قراءة لونا بانتظار مراجعتك', 'analysis', 'account'],
  'interest:received': ['أبدى شخص اهتمامه بملفك', 'activity', 'celebration'],
  'screenshot:received': ['أُخذت لقطة شاشة في المحادثة', 'chat', 'silent'],
  'application:approved': ['تم اعتماد طلب انضمامك', 'application', 'celebration'],
  'application:corrections': ['طلب انضمامك يحتاج إلى تحديث', 'support', 'account'],
  'verification:changes_requested': ['طلب التوثيق يحتاج إلى تحديث', 'verification', 'account'],
  'verification:approved': ['اكتملت مراجعة طلب التوثيق', 'verification', 'account'],
  'verification:rejected': ['لديك تحديث على طلب التوثيق', 'verification', 'account'],
  'verification:revoked': ['لديك تحديث على التوثيق', 'verification', 'account'],
  'safety:review': ['لديك تحديث خاص.', 'safety', 'account'],
  'support:reply': ['لديك رد من فريق وُدَين', 'support', 'account'],
  'membership:grant': ['تم تفعيل عضويتك', 'membership', 'celebration'],
  'membership:extend': ['تم تمديد عضويتك', 'membership', 'celebration'],
  'membership:end': ['لديك تحديث في عضويتك', 'membership', 'account'],
  'membership:payment': ['تحتاج عضويتك إلى مراجعة الدفع', 'membership', 'account'],
  'gift:invited': ['لديك دعوة لهدية عضوية', 'gifting', 'celebration'],
  'gift:received': ['وصلتك هدية عضوية', 'membership', 'celebration'],
} as const;

export type UpdateEvent = keyof typeof updateEvents;

export function isUpdateEvent(value: unknown): value is UpdateEvent {
  return typeof value === 'string' && Object.hasOwn(updateEvents, value);
}
