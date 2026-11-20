import memberAr from '../member-copy.ts';
import type { ActivityNotification, Connection, FeedbackNotice, PublicPerson, StepProgress } from '../community/data';

export type FeedKind = 'visit' | 'interest' | 'request' | 'message' | 'journey' | 'exclusive' | 'match' | 'feedback';
export type FeedFilter = 'all' | 'unread' | 'requests' | 'interests' | 'visits' | 'journey' | 'messages';
export type FeedItem = {
  id: string; kind: FeedKind; person: PublicPerson; title: string; detail: string;
  at?: string; unread: boolean; attention?: boolean; activityId?: string;
  target: 'profile' | 'request' | 'conversation' | null; requestId?: string;
};
export const feedTime = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

export function buildFeed(connections: Connection[], notifications: ActivityNotification[], progress: Map<string, StepProgress>, seen: Set<string>, feedback: FeedbackNotice[] = []): FeedItem[] {
  const active = new Set(connections.filter(c => c.status === 'accepted').map(c => c.id));
  const exclusive = new Set(notifications.filter(n => n.kind === 'exclusive').map(n => n.requestId));
  const rows: FeedItem[] = notifications.map(n => {
    const visit = n.kind === 'profile_visit';
    const interest = n.kind === 'interest';
    const open = n.requestId && active.has(n.requestId);
    return {
      id: n.id, activityId: n.id, person: n.person, kind: interest ? 'interest' : visit ? 'visit' : 'exclusive',
      at: n.createdAt, unread: !n.readAt && !seen.has(n.id), requestId: n.requestId,
      title: interest ? `${memberAr.interest} من ${n.person.alias}` : visit ? `${memberAr.visit} من ${n.person.alias}` : `اتفقت مع ${n.person.alias} على التعارف الحصري`,
      detail: interest ? 'تعرّف على الملف، وأرسل طلب تعارف إذا ناسبك' : visit ? 'يمكنك الاطّلاع على الملف أيضًا' : open ? 'يمكنكما متابعة الحديث في محادثتكما' : 'إشعار من تعارف سابق',
      target: visit || interest ? 'profile' : open ? 'conversation' : null,
    };
  });
  for (const c of connections) {
    const incoming = c.direction === 'incoming';
    const p = progress.get(c.id);
    const date = c.updatedAt || c.createdAt;
    if (c.status === 'pending') {
      const id = `request:${c.id}:${date || ''}`;
      rows.push({ id, kind: 'request', person: c.person, at: date, target: 'request', requestId: c.id,
        title: incoming ? `طلب تعارف من ${c.person.alias}` : `طلب تعارف إلى ${c.person.alias}`,
        detail: incoming ? 'اطّلع على الملف واقبل الطلب أو اعتذر' : 'طلبك بانتظار الرد',
        unread: incoming && !seen.has(id), attention: incoming });
    } else {
      if (c.unreadCount) {
        rows.push({ id: `message:${c.id}`, kind: 'message', person: c.person,
          at: c.lastMessage && !c.lastMessage.senderIsMe ? c.lastMessage.createdAt : undefined,
          title: `رسائل من ${c.person.alias}`, detail: `${new Intl.NumberFormat('ar').format(c.unreadCount)} غير مقروءة · متابعة الحديث`,
          unread: true, target: 'conversation', requestId: c.id });
      } else if (!exclusive.has(c.id)) {
        rows.push({ id: `match:${c.id}`, kind: 'match', person: c.person, at: date,
          title: `تم قبول طلب التعارف مع ${c.person.alias}`, detail: 'راجعا شروط التعارف ومدته قبل أول رسالة', unread: false,
          target: 'conversation', requestId: c.id });
      }
      const commitment = p && !p.exclusive && p.consentPeer && !p.consentMine;
      if (p && (p.rewindPeer || commitment || (p.exclusive && p.peer && !p.mine))) {
        rows.push({ id: `journey:${c.id}`, kind: 'journey', person: c.person, at: p.updatedAt,
          title: `اقتراح من ${c.person.alias}: ${p.rewindPeer ? 'العودة إلى المرحلة السابقة' : commitment ? 'التعارف الحصري' : 'الخطوة العائلية'}`,
          detail: 'راجع الاقتراح واختر ما يناسبك', unread: true, attention: true,
          target: 'conversation', requestId: c.id });
      }
    }
  }
  const activePeople = new Map(connections.filter(c => c.status === 'accepted').map(c => [c.id, c.person]));
  for (const notice of feedback) {
    const person = activePeople.get(notice.requestId);
    if (!person) continue;
    const id = `feedback:${notice.stage}:${notice.requestId}`;
    rows.push({id, kind:'feedback', person, at:notice.at, target:'conversation', requestId:notice.requestId,
      unread:!seen.has(id), title:notice.stage === 'day2' ? 'كيف كان أول تواصل بينكما؟' : 'كيف مضى أسبوع التعارف؟',
      detail:`متابعة اختيارية لتعارفك مع ${person.alias}`});
  }
  return rows.sort((a, b) => feedTime(b.at) - feedTime(a.at) || a.id.localeCompare(b.id));
}

export function filterFeed(rows: FeedItem[], filter: FeedFilter) {
  return rows.filter(row => filter === 'all' || (filter === 'unread' && row.unread)
    || (filter === 'requests' && (row.kind === 'request' || row.kind === 'match'))
    || (filter === 'visits' && row.kind === 'visit')
    || (filter === 'interests' && row.kind === 'interest')
    || (filter === 'journey' && (row.kind === 'journey' || row.kind === 'exclusive' || row.kind === 'feedback'))
    || (filter === 'messages' && row.kind === 'message'));
}
