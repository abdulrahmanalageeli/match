export const updateEvents = {
  'introduction:accepted': ['قُبل طلب التعارف', 'agreement', 'celebration'],
  'introduction:declined': ['اعتذر الطرف الآخر عن طلب التعارف', 'history', 'silent'],
  'introduction:withdrawn': ['سُحب طلب التعارف', 'history', 'silent'],
  'introduction:expired': ['انتهت مهلة طلب التعارف', 'history', 'silent'],
  'introduction:closed': ['انتهى التعارف', 'history', 'silent'],
  'family_room:invited': ['دعوة لمحادثة عائلية تنتظر موافقتك', 'family_room', 'step'],
  'family_room:ready': ['اكتملت الموافقات على المحادثة العائلية', 'family_room', 'step'],
  'family_room:active': ['محادثتكم العائلية جاهزة', 'family_room', 'step'],
  'analysis:invited': ['وصلتك دعوة لتحليل لونا المعمّق', 'analysis', 'step'],
  'analysis:shared': ['تحليل لونا المشترك جاهز', 'analysis', 'account'],
  'agreement:proposed': ['ميثاق التعارف بانتظار توقيعك', 'agreement', 'step'],
  'agreement:signed': ['اكتمل توقيع ميثاق التعارف', 'agreement', 'step'],
  'agreement:extension': ['وصلك طلب لتمديد التعارف', 'agreement', 'step'],
  'agreement:extended': ['تم تمديد التعارف', 'agreement', 'step'],
  'agreement:due': ['بقي أقل من يوم على انتهاء ميثاق التعارف', 'agreement', 'silent'],
  'agreement:expired': ['انتهت مدة التعارف', 'agreement', 'silent'],
  'agreement:family_invited': ['وصلك اقتراح للتواصل مع الأهل', 'agreement', 'step'],
  'agreement:family_confirmed': ['اتفقتوا على التواصل مع الأهل', 'agreement', 'step'],
  'journey:exclusive': ['بدأ التعارف الحصري', 'journey', 'celebration'],
  'journey:invited': ['خطوة جديدة في التعارف تنتظر ردّك', 'journey', 'step'],
  'journey:confirmed': ['اتفقتوا على الخطوة الجاية', 'journey', 'step'],
  'rematch:invited': ['وصلك طلب للرجوع إلى التعارف', 'request', 'step'],
  'family_link:pending': ['لديك طلب ربط في جسر الأهل', 'family', 'step'],
  'family_link:active': ['اكتمل الربط في جسر الأهل', 'family', 'step'],
  'family_link:reviewed': ['فيه تحديث على طلب ربط الأهل', 'family', 'account'],
  'family_link:expired': ['انتهت صلاحية رابط جسر الأهل', 'family', 'silent'],
  'missed_call:received': ['فاتتك مكالمة', 'chat', 'message'],
  'analysis:review': ['قراءة لونا بانتظار مراجعتك', 'analysis', 'account'],
  'interest:received': ['أبدى شخص اهتمامه بملفك', 'activity', 'celebration'],
  'screenshot:received': ['لقطة شاشة في المحادثة', 'chat', 'silent'],
  'application:approved': ['تم اعتماد طلب انضمامك', 'application', 'celebration'],
  'application:corrections': ['طلب انضمامك يحتاج إلى تحديث', 'support', 'account'],
  'verification:changes_requested': ['طلب التوثيق يحتاج إلى تحديث', 'verification', 'account'],
  'verification:approved': ['اكتملت مراجعة طلب التوثيق', 'verification', 'account'],
  'verification:rejected': ['لديك تحديث على طلب التوثيق', 'verification', 'account'],
  'verification:revoked': ['لديك تحديث على التوثيق', 'verification', 'account'],
  'safety:review': ['لديك تحديث خاص.', 'safety', 'account'],
  'support:reply': ['وصلك رد من فريق وُدَين', 'support', 'account'],
  'membership:grant': ['تم تفعيل عضويتك', 'membership', 'celebration'],
  'membership:extend': ['تم تمديد عضويتك', 'membership', 'celebration'],
  'membership:end': ['لديك تحديث في عضويتك', 'membership', 'account'],
  'membership:payment': ['دفعة العضوية تحتاج مراجعتك', 'membership', 'account'],
  'gift:invited': ['وصلتك دعوة لقبول هدية عضوية', 'gifting', 'celebration'],
  'gift:received': ['وصلتك هدية عضوية', 'membership', 'celebration'],
} as const;

export type UpdateEvent = keyof typeof updateEvents;

export function isUpdateEvent(value: unknown): value is UpdateEvent {
  return typeof value === 'string' && Object.hasOwn(updateEvents, value);
}


export function actionLabel(event: UpdateEvent) {
  if (event === 'family_room:active') return 'فتح المحادثة العائلية';
  if (event === 'family_room:ready') return 'عرض المساحة';
  if (event === 'family_room:invited') return 'مراجعة المشاركين';
  if (event === 'agreement:extension') return 'مراجعة التمديد';
  if (event === 'agreement:expired') return 'اختيار الخطوة التالية';
  if (event === 'analysis:review') return 'مراجعة المشاركة';
  switch (updateEvents[event][1]) {
    case 'agreement': return 'مراجعة ميثاق التعارف';
    case 'journey': return 'فتح مسار التعارف';
    case 'activity': return 'عرض الملف';
    case 'history': return 'عرض حالة الطلب';
    case 'analysis': return 'فتح التحليل المعمّق';
    case 'family': return 'فتح طلب الربط';
    case 'chat': return 'فتح المحادثة';
    case 'support': return 'فتح الطلب';
    case 'verification': return 'فتح مراجعة التوثيق';
    case 'gifting': return 'عرض الهدية';
    case 'membership': return 'عرض العضوية';
    case 'application': return 'متابعة الانضمام';
    case 'safety': return 'عرض التحديث الخاص';
    default: return 'عرض الطلب';
  }
}
