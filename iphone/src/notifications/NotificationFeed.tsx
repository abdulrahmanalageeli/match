import { Gift } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, ChevronLeft, Eye, Heart, HeartHandshake, MessageCircle, Route, Send, LockKeyhole, ShieldCheck, Sparkles } from "../BrandIcons";
import { PersonAvatar } from '../avatars/PersonAvatar';
import type { ActivityNotification, CommunitySource, Connection, FeedbackNotice, PublicPerson, StepProgress } from '../community/data';
import { buildFeed, feedTime, filterFeed, isRecentNotification, type FeedFilter, type FeedItem } from './feed';
import { emptyFeed } from './emptyFeed';
import { readAlertProgress } from './alertProgress';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { notificationUpdates, type InAppUpdate, type PushOpen } from './push';
import { updateEvents } from '../../admin/server/updateEvents';
import './notification-feed.css';

const viewedRequests = new WeakMap<CommunitySource, Set<string>>();
const filters: { id: FeedFilter; label: string }[] = [
  {id:'all',label:'الكل'}, {id:'unread',label:'غير المقروءة'}, {id:'requests',label:'التعارف'},
  {id:'interests',label:'الاهتمام'},
  {id:'visits',label:'الزيارات'}, {id:'journey',label:'المسار'}, {id:'messages',label:'الرسائل'},
];
const dateFormat = new Intl.DateTimeFormat('ar-SA', {calendar:'gregory',day:'numeric',month:'long'});
const datedYearFormat = new Intl.DateTimeFormat('ar-SA', {calendar:'gregory',day:'numeric',month:'long',year:'numeric'});
const timeFormat = new Intl.DateTimeFormat('ar-SA', {hour:'numeric',minute:'2-digit'});
const fullDate = new Intl.DateTimeFormat('ar-SA', {calendar:'gregory',dateStyle:'long',timeStyle:'short'});
function dayLabel(at?: string) {
  if (!feedTime(at)) return 'تحديثات بلا تاريخ';
  const date = new Date(at!), today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === today.toDateString() ? 'اليوم' : date.toDateString() === yesterday.toDateString() ? 'أمس' : (date.getFullYear() === today.getFullYear() ? dateFormat : datedYearFormat).format(date);
}
function EventIcon({ item }: { item: FeedItem }) {
  const props = {size:12,strokeWidth:1.8,'aria-hidden':true as const};
  if (item.kind === 'screenshot') return <LockKeyhole {...props}/>;
  if (item.kind === 'visit') return <Eye {...props}/>;
  if (item.kind === 'interest') return <Heart {...props}/>;
  if (item.kind === 'message' || item.kind === 'feedback') return <MessageCircle {...props}/>;
  if (item.kind === 'journey') return <Route {...props}/>;
  if (item.kind === 'exclusive') return <HeartHandshake {...props}/>;
  return item.kind === 'match' ? <Heart {...props}/> : <Send {...props}/>;
}

export function NotificationFeed({ pushOwner, openUpdate, initialInterest, onIntentOpened, source, connections, onProfile, onConversation, onRequest, onBrowse, onRetry, loading: connectionsLoading = false, error: connectionError = '' }: {
  pushOwner?:string|null; openUpdate?:(update:PushOpen)=>void|Promise<void>;
  initialInterest?:string; onIntentOpened?:()=>void;
  source: CommunitySource; connections: Connection[]; onProfile: (person: PublicPerson) => void;
  onConversation: (id: string, openFeedback?: boolean) => void; onRequest: (id: string) => void; loading?: boolean; error?: string;
  onBrowse?: () => void; onRetry?: () => void;
}) {
  const [items, setItems] = useState<ActivityNotification[]>([]), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [filter, setFilter] = useState<FeedFilter>('all');
  const [progress, setProgress] = useState(new Map<string, StepProgress>()), [opening, setOpening] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackNotice[]>([]);
  const [memberUpdates,setMemberUpdates]=useState<InAppUpdate[]>([]);
  const [expandedUpdates,setExpandedUpdates]=useState(false);
  const [seen, setSeen] = useState(() => viewedRequests.get(source) || new Set<string>());
  const connectionsRef = useRef(connections); connectionsRef.current = connections;
  const openingRef = useRef(false);
  const acceptedIds = connections.filter(c => c.status === 'accepted').map(c => c.id).sort().join(',');
  useEffect(()=>{
    setMemberUpdates([]);
    setExpandedUpdates(false);
    if(!pushOwner)return;
    let active=true,pending=false;
    const refresh=async()=>{
      if(document.hidden||pending)return;
      pending=true;
      try {const rows=await notificationUpdates(pushOwner);if(active)setMemberUpdates(rows);}
      catch { /* Keep the existing activity feed available during delivery rollout. */ }
      finally {pending=false;}
    };
    void refresh();
    const timer=window.setInterval(refresh,30000);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[pushOwner]);
  useEffect(() => {
    setLoading(true); setItems([]); setProgress(new Map()); setFeedback([]);
    setSeen(viewedRequests.get(source) || new Set());
  }, [source]);
  useEffect(() => {
    let active = true, busy = false, rerun = false;
    async function refresh() {
      if (document.hidden) return;
      if (busy) { rerun = true; return; }
      busy = true;
      try {
        const [events, steps, notices] = await Promise.all([
          source.notifications?.() || Promise.resolve([]),
          readAlertProgress(source, connectionsRef.current.filter(c => c.status === 'accepted')),
          acceptedIds ? source.conversationPilotNotices?.().catch(() => []) : [],
        ]);
        if (active) { setItems(events); setProgress(steps); setFeedback(notices ?? []); setError(''); }
      } catch { if (active) setError('تعذّر تحديث بعض الإشعارات. تظهر طلباتك المتاحة أدناه.'); }
      finally {
        busy = false;
        if (active) { setLoading(false); if (rerun) { rerun = false; void refresh(); } }
      }
    }
    void refresh(); const stop = source.watch(() => void refresh());
    const timer = acceptedIds && source.conversationPilotNotices ? window.setInterval(refresh, 5*60*1000) : undefined;
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => { active = false; stop(); window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
  }, [source, retry, acceptedIds]);

  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const timer = window.setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const events = useMemo(() => buildFeed(connections, items, progress, seen, feedback), [connections, items, progress, seen, feedback]);
  const rows = events.filter(item => isRecentNotification(item.at, now));
  const recentUpdates = memberUpdates.filter(update => isRecentNotification(update.createdAt, now));
  useEffect(()=>{
    if(!initialInterest||loading)return;
    setFilter('interests');
    const item=events.find(row=>row.kind==='interest'&&
      (row.person.id===initialInterest||initialInterest==='tester-pair'));
    if(item){
      onProfile(item.person);
      if(item.activityId) void source.readNotifications?.([item.activityId]).catch(()=>{});
    }
    onIntentOpened?.();
  },[initialInterest,loading,events,source,onProfile,onIntentOpened]);
  const visible = filterFeed(rows, filter);
  const visibleUpdates=filter==='all'?recentUpdates:filter==='unread'?recentUpdates.filter(update=>update.unread):[];
  const unread = rows.filter(item => item.unread).length+recentUpdates.filter(item=>item.unread).length;
  const empty = emptyFeed(filter);
  async function open(item: FeedItem) {
    if (openingRef.current || !item.target) return;
    openingRef.current = true; setOpening(item.id); setError('');
    try {
      if (item.target === 'profile') onProfile(item.person);
      else if (item.requestId && connections.some(c => c.id === item.requestId)) {
        if (item.target === 'request') onRequest(item.requestId); else onConversation(item.requestId, item.kind === 'feedback');
      } else { setError('تغيّرت حالة هذا التعارف. حدّث الإشعارات للاطّلاع على آخر المستجدات.'); return; }
      // Navigation must not wait for a read receipt. A failed receipt remains
      // unread on the next refresh, so it can be retried without blocking entry.
      if (item.activityId) void Promise.resolve().then(() => source.readNotifications?.([item.activityId!])).catch(() => {});
      else { const next = new Set(seen).add(item.id); viewedRequests.set(source, next); setSeen(next); }
    } catch { setError('تعذّر فتح الإشعار. حاول مجددًا.'); }
    finally { openingRef.current = false; setOpening(null); }
  }
  return <section className="cm-notification-feed" aria-label="الإشعارات والتحديثات">
    {pushOwner&&openUpdate&&visibleUpdates.length>0&&
      <div className="nf-member-updates" aria-label="مستجدات وُدَين">
        {visibleUpdates.slice(0,expandedUpdates?25:4).map(update=>{
          const [title,destination,cue]=updateEvents[update.event];
          const Icon=destination==='analysis'?Sparkles:cue==='step'?Route:cue==='account'?ShieldCheck:cue==='celebration'?Gift:MessageCircle;
          return <button className="nf-member-update" type="button" key={update.id} data-cue={cue} data-unread={update.unread} onClick={async()=>{
            try {
              await openUpdate({kind:'update',requestId:update.target,event:update.event});
              setMemberUpdates(rows=>rows.map(row=>row.id===update.id?{...row,unread:false}:row));
              void notificationUpdates(pushOwner,update.id).catch(()=>{});
            } catch {setError('تعذّر فتح هذا التحديث. حاول مجددًا.');}
          }}>
            <span className="nf-member-update-icon"><Icon size={17} aria-hidden="true"/></span>
            <span><strong>{title}</strong><small>{datedYearFormat.format(new Date(update.createdAt))}</small></span>
            <ChevronLeft size={15} aria-hidden="true"/>
          </button>;
        })}
        {visibleUpdates.length>4&&
          <button type="button" className="btn-text" aria-expanded={expandedUpdates} onClick={()=>setExpandedUpdates(value=>!value)}>
            {expandedUpdates?'عرض أقل':'بقية المستجدات'}
          </button>}
      </div>}
    {unread > 0 && <div className="nf-feed-summary" role="status"><span>الإشعارات غير المقروءة</span><b>{new Intl.NumberFormat('ar').format(unread)}</b></div>}
    <div className="nf-feed-filters" role="group" aria-label="تصفية الإشعارات">{filters.map(option => <button key={option.id} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}{option.id === 'unread' && unread > 0 && <span>{new Intl.NumberFormat('ar').format(unread)}</span>}</button>)}</div>
    {(error || connectionError) && <div className="nf-feed-error" role="alert"><span>{error || connectionError}</span><button onClick={() => { setRetry(n => n + 1); onRetry?.(); }}>إعادة المحاولة</button></div>}
    {(loading || connectionsLoading) && !rows.length && !visibleUpdates.length && <div className="nf-feed-loading" role="status"><span/><span/><span/><span className="mi-sr-only">جارٍ تحميل الإشعارات…</span></div>}
    {!loading && !connectionsLoading && !error && !connectionError && !visible.length && !visibleUpdates.length && <MotionReveal key={filter} className="nf-feed-empty" duration={320} distance={6}><span>{filter === 'unread' ? <Check size={24}/> : <Bell size={23}/>}</span><h2>{empty.title}</h2><p>{empty.detail}</p>
      {filter !== 'all' && <MotionPressButton className="btn-secondary" onClick={() => setFilter('all')}>عرض كل التحديثات</MotionPressButton>}
      {filter === 'all' && onBrowse && <MotionPressButton className="btn-secondary" onClick={onBrowse}>استكشف الملفات</MotionPressButton>}
    </MotionReveal>}
    <div className="nf-feed-timeline">{visible.map((item, index) => {
      const group = dayLabel(item.at), showGroup = index === 0 || group !== dayLabel(visible[index - 1].at);
      return <div key={item.id} className="nf-feed-entry">
        {showGroup && <h2 className="nf-feed-day">{group}</h2>}
        <button className="cm-notification-row" data-unread={item.unread || undefined} data-kind={item.kind} disabled={!item.target || opening !== null} aria-busy={opening === item.id || undefined} onClick={() => void open(item)}>
          <span className="nf-feed-avatar"><PersonAvatar person={item.person} source={source}/><i><EventIcon item={item}/></i></span>
          <span className="nf-feed-copy"><span className="nf-feed-row-head"><strong>{item.title}</strong>{item.unread && <i className="nf-feed-unread" aria-label="غير مقروء"/>}</span><small>{item.detail}</small>
            <span className="nf-feed-meta">{item.unread && <span className="nf-feed-read-state">جديد</span>}{feedTime(item.at) ? <time dateTime={item.at} title={fullDate.format(new Date(item.at!))}>{timeFormat.format(new Date(item.at!))}</time> : <span>الوقت غير متوفر</span>}{item.attention && <em>بانتظارك</em>}</span>
          </span>
          {item.target && <ChevronLeft className="nf-feed-chevron" size={15} aria-hidden="true"/>}
        </button>
      </div>;
    })}</div>
  </section>;
}
