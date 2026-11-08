import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, ChevronLeft, Eye, Heart, HeartHandshake, MessageCircle, Route, Send } from 'lucide-react';
import { AvatarPortrait } from '../avatars/AvatarPortrait';
import type { ActivityNotification, CommunitySource, Connection, PublicPerson, StepProgress } from '../community/data';
import { buildFeed, feedTime, filterFeed, type FeedFilter, type FeedItem } from './feed';
import { emptyFeed } from './emptyFeed';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import './notification-feed.css';

const viewedRequests = new WeakMap<CommunitySource, Set<string>>();
const filters: { id: FeedFilter; label: string }[] = [
  {id:'all',label:'الكل'}, {id:'unread',label:'غير المقروءة'}, {id:'requests',label:'التعارف'},
  {id:'interests',label:'الاهتمام'},
  {id:'visits',label:'الزيارات'}, {id:'journey',label:'المسار'}, {id:'messages',label:'الرسائل'},
];
const dateFormat = new Intl.DateTimeFormat('ar-SA', {calendar:'gregory',day:'numeric',month:'long'});
const timeFormat = new Intl.DateTimeFormat('ar-SA', {hour:'numeric',minute:'2-digit'});
const fullDate = new Intl.DateTimeFormat('ar-SA', {calendar:'gregory',dateStyle:'long',timeStyle:'short'});
function dayLabel(at?: string) {
  if (!feedTime(at)) return 'تحديثات مستمرة';
  const date = new Date(at!), today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === today.toDateString() ? 'اليوم' : date.toDateString() === yesterday.toDateString() ? 'أمس' : dateFormat.format(date);
}
function EventIcon({ item }: { item: FeedItem }) {
  const props = {size:12,strokeWidth:1.8,'aria-hidden':true as const};
  if (item.kind === 'visit') return <Eye {...props}/>;
  if (item.kind === 'interest') return <Heart {...props}/>;
  if (item.kind === 'message') return <MessageCircle {...props}/>;
  if (item.kind === 'journey') return <Route {...props}/>;
  if (item.kind === 'exclusive') return <HeartHandshake {...props}/>;
  return item.kind === 'match' ? <Heart {...props}/> : <Send {...props}/>;
}

export function NotificationFeed({ source, connections, onProfile, onConversation, onRequest, onBrowse, onRetry, loading: connectionsLoading = false, error: connectionError = '' }: {
  source: CommunitySource; connections: Connection[]; onProfile: (person: PublicPerson) => void;
  onConversation: (id: string) => void; onRequest: (id: string) => void; loading?: boolean; error?: string;
  onBrowse?: () => void; onRetry?: () => void;
}) {
  const [items, setItems] = useState<ActivityNotification[]>([]), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [filter, setFilter] = useState<FeedFilter>('all');
  const [progress, setProgress] = useState(new Map<string, StepProgress>()), [opening, setOpening] = useState<string | null>(null);
  const [seen, setSeen] = useState(() => viewedRequests.get(source) || new Set<string>());
  const connectionsRef = useRef(connections); connectionsRef.current = connections;
  const openingRef = useRef(false);
  const acceptedIds = connections.filter(c => c.status === 'accepted').map(c => c.id).sort().join(',');
  useEffect(() => {
    let active = true, busy = false, rerun = false;
    setLoading(true); setItems([]); setProgress(new Map());
    setSeen(viewedRequests.get(source) || new Set());
    async function refresh() {
      if (document.hidden) return;
      if (busy) { rerun = true; return; }
      busy = true;
      try {
        const [events, steps] = await Promise.all([
          source.notifications?.() || Promise.resolve([]),
          Promise.all(connectionsRef.current.filter(c => c.status === 'accepted').map(async c => {
            try { return [c.id, await source.progress?.(c.id)] as const; }
            catch { return [c.id, undefined] as const; }
          })),
        ]);
        if (active) { setItems(events); setProgress(new Map(steps.filter((entry): entry is readonly [string, StepProgress] => Boolean(entry[1])))); setError(''); }
      } catch { if (active) setError('تعذّر تحديث بعض الإشعارات. تظهر طلباتك المتاحة أدناه.'); }
      finally {
        busy = false;
        if (active) { setLoading(false); if (rerun) { rerun = false; void refresh(); } }
      }
    }
    void refresh(); const stop = source.watch(() => void refresh());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { active = false; stop(); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [source, retry, acceptedIds]);

  const rows = useMemo(() => buildFeed(connections, items, progress, seen), [connections, items, progress, seen]);
  const visible = filterFeed(rows, filter), unread = rows.filter(item => item.unread).length;
  const empty = emptyFeed(filter);
  async function open(item: FeedItem) {
    if (openingRef.current || !item.target) return;
    openingRef.current = true; setOpening(item.id); setError('');
    try {
      if (item.activityId) await source.readNotifications?.([item.activityId]);
      const next = new Set(seen).add(item.id); viewedRequests.set(source, next); setSeen(next);
      if (item.target === 'profile') onProfile(item.person);
      else if (item.requestId && connections.some(c => c.id === item.requestId)) {
        if (item.target === 'request') onRequest(item.requestId); else onConversation(item.requestId);
      } else setError('تغيّرت حالة هذا التعارف. حدّث الإشعارات للاطّلاع على آخر المستجدات.');
    } catch { setError('تعذّر فتح الإشعار. حاول مجددًا.'); }
    finally { openingRef.current = false; setOpening(null); }
  }
  return <section className="cm-notification-feed" aria-label="الإشعارات والتحديثات">
    <div className="nf-feed-summary"><span>كل ما يخصّ تعارفك، في مكان واحد</span>{unread > 0 && <b>{new Intl.NumberFormat('ar').format(unread)} جديد</b>}</div>
    <div className="nf-feed-filters" role="group" aria-label="تصفية الإشعارات">{filters.map(option => <button key={option.id} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}{option.id === 'unread' && unread > 0 && <span>{new Intl.NumberFormat('ar').format(unread)}</span>}</button>)}</div>
    {(error || connectionError) && <div className="nf-feed-error" role="alert"><span>{error || connectionError}</span><button onClick={() => { setRetry(n => n + 1); onRetry?.(); }}>إعادة المحاولة</button></div>}
    {(loading || connectionsLoading) && !rows.length && <div className="nf-feed-loading" role="status"><span/><span/><span/><span className="mi-sr-only">جارٍ تحميل الإشعارات…</span></div>}
    {!loading && !connectionsLoading && !error && !connectionError && !visible.length && <MotionReveal key={filter} className="nf-feed-empty" duration={320} distance={6}><span>{filter === 'unread' ? <Check size={24}/> : <Bell size={23}/>}</span><h2>{empty.title}</h2><p>{empty.detail}</p>
      {filter !== 'all' && <MotionPressButton className="btn-secondary" onClick={() => setFilter('all')}>عرض كل التحديثات</MotionPressButton>}
      {filter === 'all' && onBrowse && <MotionPressButton className="btn-secondary" onClick={onBrowse}>استكشف الملفات</MotionPressButton>}
    </MotionReveal>}
    <div className="nf-feed-timeline">{visible.map((item, index) => {
      const group = dayLabel(item.at), showGroup = index === 0 || group !== dayLabel(visible[index - 1].at);
      return <div key={item.id} className="nf-feed-entry">
        {showGroup && <h2 className="nf-feed-day">{group}</h2>}
        <button className="cm-notification-row" data-unread={item.unread || undefined} data-kind={item.kind} disabled={!item.target || opening !== null} aria-busy={opening === item.id || undefined} onClick={() => void open(item)}>
          <span className="nf-feed-avatar" aria-hidden="true">{item.person.publicAvatar ? <AvatarPortrait avatar={item.person.publicAvatar} decorative/> : <span className="nf-feed-initial">{item.person.alias.slice(0,1)}</span>}<i><EventIcon item={item}/></i></span>
          <span className="nf-feed-copy"><span className="nf-feed-row-head"><strong>{item.title}</strong>{item.unread && <i className="nf-feed-unread" aria-label="غير مقروء"/>}</span><small>{item.detail}</small>
            <span className="nf-feed-meta">{feedTime(item.at) ? <time dateTime={item.at} title={fullDate.format(new Date(item.at!))}>{timeFormat.format(new Date(item.at!))}</time> : <span>الوقت غير متوفر</span>}{item.attention && <em>بانتظارك</em>}</span>
          </span>
          {item.target && <ChevronLeft className="nf-feed-chevron" size={15} aria-hidden="true"/>}
        </button>
      </div>;
    })}</div>
  </section>;
}
