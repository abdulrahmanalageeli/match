import type { Connection, SeriousnessAgreement, StepProgress } from './data';

export type NextStepAssessment = { completed: number; total: number; label: string };
export type NextStepChoice = {
  key: string;
  kind: 'agreement' | 'journey' | 'request' | 'message' | 'assessment' | 'capacity' | 'waiting' | 'start';
  title: string;
  detail: string;
  action: string;
  target: 'request' | 'conversation' | 'assessment';
  connectionId?: string;
  attention?: boolean;
};
export type NextStepState = { loaded: boolean; acceptedCount: number; exclusive: boolean; pendingIncomingCount: number };
export type NextStepSnapshot = {
  connections: Connection[];
  agreements: Map<string, SeriousnessAgreement>;
  progress: Map<string, StepProgress>;
  requiresAgreement?: boolean;
};

export function nextStepState(snapshot: NextStepSnapshot): NextStepState {
  const accepted = snapshot.connections.filter(c => c.status === 'accepted');
  return {
    loaded: true,
    acceptedCount: accepted.length,
    exclusive: accepted.some(c => snapshot.progress.get(c.id)?.exclusive || c.person.exclusive),
    pendingIncomingCount: snapshot.connections.filter(c => c.status === 'pending' && c.direction === 'incoming').length,
  };
}

/** Offer one useful action. Never infer consent, readiness, or a completed assessment. */
export function chooseNextStep(snapshot: NextStepSnapshot, assessment?: NextStepAssessment): NextStepChoice | null {
  const accepted = snapshot.connections.filter(c => c.status === 'accepted');
  const state = nextStepState(snapshot);
  const conversation = (c: Connection, kind: NextStepChoice['kind'], title: string, detail: string, action: string, attention = false): NextStepChoice => ({
    key: `${kind}:${c.id}:${title}`, kind, title, detail, action, target: 'conversation', connectionId: c.id, attention,
  });

  for (const c of accepted) {
    const a = snapshot.agreements.get(c.id);
    const p = snapshot.progress.get(c.id);
    if (a?.extension && (a.status === 'accepted' || a.status === 'expired') && a.extension.actor !== a.actor) {
      return conversation(c, 'agreement', 'اقتراح تمديد بانتظارك', `${c.person.alias} يقترح ${a.extension.days} أيام إضافية. لا تتغير المدة حتى توافق.`, 'مراجعة التمديد', true);
    }
    if (a?.status === 'expired' && !a.familyAgreed?.[a.actor]) {
      return conversation(c, 'agreement', 'راجعا اتجاه التعارف', `انتهت المدة مع ${c.person.alias}. اختارا التمديد أو التواصل العائلي أو الانسحاب بوضوح.`, 'مراجعة اتفاقنا', true);
    }
    if (a?.status === 'none' && a.actor === 'reham') {
      return conversation(c, 'agreement', 'بداية واضحة قبل أول رسالة', `اختاري مدة التعارف مع ${c.person.alias} ووقّعي الميثاق، ثم يراجع الطرف الآخر اقتراحك.`, 'اقتراح مدة التعارف', true);
    }
    if (a?.status === 'proposed' && a.actor === 'abdulrahman' && !a.manSignedAt) {
      return conversation(c, 'agreement', 'اتفاقكما بانتظارك', `${c.person.alias} اقترحت مدة التعارف. راجع الميثاق والمدة قبل قبولها.`, 'مراجعة الميثاق', true);
    }
    if (a?.status === 'accepted' && a.familyAgreed?.[a.actor === 'reham' ? 'abdulrahman' : 'reham'] && !a.familyAgreed?.[a.actor]) {
      return conversation(c, 'agreement', 'اقتراح للتواصل العائلي', `${c.person.alias} اقترح الانتقال للتواصل العائلي. القرار بموافقتكما معًا.`, 'مراجعة الاقتراح', true);
    }
    if (p?.rewindPeer && !p.rewindMine) {
      return conversation(c, 'journey', 'مساحة لمراجعة الخطوة', `${c.person.alias} طلب العودة خطوة. راجعا ما يريحكما قبل أي تغيير.`, 'مراجعة مسارنا', true);
    }
    if (p && ((!p.exclusive && p.consentPeer && !p.consentMine) || (p.exclusive && p.stage < 2 && p.peer && !p.mine))) {
      return conversation(c, 'journey', 'خطوتكما التالية بانتظارك', p.exclusive ? `${c.person.alias} يقترح خطوة تالية في مسار التعارف.` : `${c.person.alias} يقترح نقاشًا جادًا وحصريًا. اقرأ ما يترتب عليه قبل الموافقة.`, 'مراجعة مسارنا', true);
    }
  }

  if (!state.exclusive && state.acceptedCount < 2) {
    const incoming = snapshot.connections.find(c => c.status === 'pending' && c.direction === 'incoming');
    if (incoming) return {
      key: `request:${incoming.id}`, kind: 'request', title: 'دعوة تستحقّ أن تقرأها',
      detail: `${incoming.person.alias} يرغب بالتعارف معك. ابدأ بالملف، وخذ وقتك في القرار.`,
      action: 'الاطّلاع على الدعوة', target: 'request', connectionId: incoming.id, attention: true,
    };
  }
  const unread = accepted.find(c => (c.unreadCount ?? 0) > 0);
  if (unread) return conversation(unread, 'message', `حديثك مع ${unread.person.alias} مستمر`, 'لديك رسائل لم تقرأها بعد. عُد إلى الحديث من حيث توقفت.', 'قراءة الرسائل', true);

  if (assessment && Number.isFinite(assessment.completed) && assessment.total > 0 && assessment.completed >= 0 && assessment.completed < assessment.total) {
    const remaining = new Intl.NumberFormat('ar-SA').format(assessment.total - assessment.completed);
    return { key: `assessment:${assessment.label}`, kind: 'assessment', title: 'مواقف بيننا · قراءة إضافية للتوافق',
      detail: `تمرين اختياري من ${remaining} مواقف يكشف كيف تتعاملان مع الحياة اليومية.`,
      action: assessment.completed ? 'تابع مواقف بيننا' : 'جرّب مواقف بيننا', target: 'assessment' };
  }

  const exclusive = accepted.find(c => snapshot.progress.get(c.id)?.exclusive || c.person.exclusive);
  if (exclusive) return conversation(exclusive, 'capacity', `مساحتك الآن مع ${exclusive.person.alias}`,
    snapshot.progress.get(exclusive.id)?.stage === 2 ? 'وصلتما للخطوة العائلية. اتفقا على الشخص والوسيلة والموعد بالوتيرة التي تناسبكما.' : 'اخترتما التعارف الحصري. لا تبدأ طلبات جديدة خلاله، ويمكنكما مراجعة المسار معًا.', 'متابعة مسارنا');
  if (accepted.length >= 2) return conversation(accepted[0], 'capacity', 'مساحة للتعارف بتركيز',
    'لديك تعارفان قائمان؛ هذا هو الحد الحالي. يمكنك تصفّح الملفات، وتبدأ دعوة جديدة بعد انتهاء أحد التعارفين.', `متابعة الحديث مع ${accepted[0].person.alias}`);

  for (const c of accepted) {
    const a = snapshot.agreements.get(c.id);
    if (a?.status === 'none' || a?.status === 'proposed' || a?.status === 'expired') {
      return conversation(c, 'waiting', 'الخطوة التالية لدى الطرف الآخر',
        a.status === 'none' ? `${c.person.alias} يختار مدة التعارف قبل توقيع الميثاق وبدء الحديث.` : `اقتراحك مع ${c.person.alias} بانتظار المراجعة. يمكنك الاطّلاع على اتفاقكما في المحادثة.`, 'عرض اتفاقنا');
    }
  }
  const fresh = accepted.find(c => !c.lastMessage && (!snapshot.requiresAgreement || ['accepted', 'family'].includes(snapshot.agreements.get(c.id)?.status ?? '')));
  if (fresh) return conversation(fresh, 'start', 'ابدآ بسؤال يفهم الآخر', `مساحتك مع ${fresh.person.alias} جاهزة. أفكار الحديث داخل المحادثة تنطلق من إجاباتكما.`, 'فتح المحادثة');
  const outgoing = snapshot.connections.find(c => c.status === 'pending' && c.direction === 'outgoing');
  if (outgoing) return { key: `waiting:${outgoing.id}`, kind: 'waiting', title: 'دعوتك وصلت، والقرار بهدوء',
    detail: `طلبك إلى ${outgoing.person.alias} بانتظار الرد. يظهر أي تحديث في الإشعارات.`, action: 'متابعة طلبي', target: 'request', connectionId: outgoing.id };
  return null;
}
