export const conductKinds = {
  warning: 'تنبيه من الفريق',
  pledge: 'تعهّد سلوكي',
  restriction: 'تقييد مؤقت',
  suspension: 'إيقاف الحساب',
} as const;
export const policyNames = {
  contact: 'احترام حدود التواصل',
  safety: 'سلامة الأعضاء',
  identity: 'صحة معلومات الحساب',
  privacy: 'خصوصية الأعضاء',
  other: 'قواعد استخدام وُدَين',
} as const;
export type ConductNotice = {
  id: string;
  kind: keyof typeof conductKinds;
  origin: 'staff' | 'automated';
  policy: keyof typeof policyNames;
  explanation: string;
  pledge: string | null;
  endsAt: string | null;
  issuedAt: string;
  acknowledgedAt: string | null;
  appealedAt: string | null;
  needsReview: boolean;
  decision: 'upheld' | 'lifted' | null;
  outcome: string | null;
  reviewedAt: string | null;
  expired: boolean;
  unread: boolean;
  revision: number;
};
export function noticeStatus(item: ConductNotice, audience: 'member' | 'staff' = 'member') {
  if (item.decision === 'lifted') return 'رُفع الإجراء';
  if (item.appealedAt && item.needsReview) return audience === 'staff' ? 'بانتظار المراجعة' : 'طلبك قيد المراجعة';
  if (item.expired || (item.endsAt && Date.parse(item.endsAt) <= Date.now())) return 'انتهت مدة التقييد';
  if (item.decision === 'upheld') return 'أُيّد الإجراء بعد المراجعة';
  if (item.acknowledgedAt) return item.kind === 'pledge' ? 'تم تأكيد التعهّد' : 'تم الاطلاع';
  if (item.origin === 'automated') return 'بانتظار مراجعة الفريق';
  switch (item.kind) {
    case 'warning': return audience === 'staff' ? 'بانتظار اطّلاع العضو' : 'بانتظار اطّلاعك';
    case 'pledge': return audience === 'staff' ? 'بانتظار تأكيد العضو' : 'بانتظار تأكيدك';
    case 'restriction': return 'التقييد سارٍ';
    case 'suspension': return 'الحساب موقوف';
  }
}
const formatter = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long', year:'numeric', hour: 'numeric', minute: '2-digit',
});
export const conductDate = (value: string) => formatter.format(new Date(value));
