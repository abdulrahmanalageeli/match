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
import { actionLabel, updateEvents } from '../../admin/server/updateEvents';
import type { CompatibilityUpdate } from './ActivityAlerts';
import { CompatibilityChangeSheet } from './CompatibilityNotice';
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

export function NotificationFeed({ compatibilityUpdates = [], onCompatibilityRead, curatedUpdate, onCuratedUpdate, pushOwner, openUpdate, initialInterest, onIntentOpened, source, connections, onProfile, onConversation, onRequest, onBrowse, onRetry, loading: connectionsLoading = false, error: connectionError = '' }: {
  compatibilityUpdates?:CompatibilityUpdate[]; onCompatibilityRead?:(id:string,key:string)=>void;
  curatedUpdate?:{id:string;name:string;at:string}; onCuratedUpdate?:()=>void;
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
  const [openFit,setOpenFit]=useState<string>();
  const [seen, setSeen] = useState(() => viewedRequests.get(source) || new Set<string>());
  const connectionsRef = useRef(connections); connectionsRef.current = connections;
  const openingRef = useRef(false);
  const acceptedIds = useMemo(()=>connections.filter(c => c.status === 'accepted').map(c => c.id).sort().join(','),[connections]);
  useEffect(()=>{
    setMemberUpdates([]);
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
    const timer=window.setInterval(refresh,10000);
    const stop=source.watch(refresh, 'nonChat');
    window.addEventListener('wudayn:notification-read',refresh);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{active=false;clearInterval(timer);stop();window.removeEventListener('wudayn:notification-read',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[pushOwner,source]);
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
      } catch { if (active) setError('ما قدرنا نحدّث كل الإشعارات. طلبات التعارف المتاحة لك موجودة هنا.'); }
      finally {
        busy = false;
        if (active) { setLoading(false); if (rerun) { rerun = false; void refresh(); } }
      }
    }
    void refresh(); const stop = source.watch(() => void refresh(), 'nonChat');
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
  const recentUpdates = memberUpdates.filter(update => isRecentNotification(update.createdAt, now));
  const durable = new Set(recentUpdates.map(update=>update.event+':'+update.target));
  const rows = events.filter(item => {
    if(!isRecentNotification(item.at,now))return false;
    if(item.kind==='match')return !durable.has('introduction:accepted:'+item.requestId);
    if(item.kind==='exclusive')return !durable.has('journey:exclusive:'+item.requestId);
    if(item.kind==='journey')return !durable.has('journey:invited:'+item.requestId);
    return true;
  });
  useEffect(()=>{
    if(!initialInterest||loading)return;
    setFilter('interests');
    const item=events.find(row=>row.kind==='interest'&&
      (row.person.id===initialInterest||initialInterest==='tester-pair'));
    if(item){
      onProfile(item.person);
      if(item.activityId) void source.readNotifications?.([item.activityId]).catch(()=>{});
    } else setError('هذا الملف لم يعد متاحًا من الإشعار.');
    onIntentOpened?.();
  },[initialInterest,loading,events,source,onProfile,onIntentOpened]);
  const visible = filterFeed(rows, filter);
  const updateMatchesFilter = (update: InAppUpdate) => {
    const destination=updateEvents[update.event][1];
    if (filter==='all') return true;
    if (filter==='unread') return update.unread;
    if (filter==='journey') return ['agreement','journey','family','family_room','analysis'].includes(destination);
    if (filter==='requests') return ['request','history'].includes(destination)||update.event==='introduction:accepted';
    if (filter==='messages') return destination==='chat';
    return false;
  };
  const visibleUpdates=recentUpdates.filter(updateMatchesFilter);
  const recentFits=compatibilityUpdates.filter(row=>isRecentNotification(row.at,now));
  const fitDetail=recentFits.find(row=>row.id===openFit);
  const visibleFits=recentFits.filter(row=>filter==='all'||filter==='journey'||filter==='unread'&&row.unread);
  const showCurated=curatedUpdate&&isRecentNotification(curatedUpdate.at,now);
  const timeline = [
    ...visible.map(row=>({type:'activity' as const,row,id:row.id,at:row.at})),
    ...visibleUpdates.map(row=>({type:'update' as const,row,id:row.id,at:row.createdAt})),
    ...visibleFits.map(row=>({type:'fit' as const,row,id:'fit:'+row.id,at:row.at})),
    ...(showCurated && ['all','unread','requests'].includes(filter) ? [{type:'curated' as const,row:curatedUpdate!,id:'curated:'+curatedUpdate!.id,at:curatedUpdate!.at}] : []),
  ].sort((a,b)=>feedTime(b.at)-feedTime(a.at)||a.id.localeCompare(b.id));
  const unread=rows.filter(row=>row.unread).length+recentUpdates.filter(row=>row.unread).length+
    recentFits.filter(row=>row.unread).length+Number(Boolean(showCurated));
  const empty = emptyFeed(filter);
  async function open(item: FeedItem) {
    if (openingRef.current || !item.target) return;
    openingRef.current = true; setOpening(item.id); setError('');
    try {
      if (item.target === 'profile') onProfile(item.person);
      else if (item.requestId && connections.some(c => c.id === item.requestId)) {
        if (item.target === 'request') onRequest(item.requestId);
        else if (openUpdate && (item.kind==='journey'||item.kind==='exclusive'||item.kind==='match')) await openUpdate({
          requestId:item.requestId,kind:'update',event:item.kind==='match'?'introduction:accepted':
            item.kind==='exclusive'?'journey:confirmed':'journey:invited',
        });
        else onConversation(item.requestId, item.kind === 'feedback');
      } else { setError('تغيّرت حالة التعارف. حدّث الإشعارات عشان تشوف آخر تحديث.'); return; }
      // Navigation must not wait for a read receipt. A failed receipt remains
      // unread on the next refresh, so it can be retried without blocking entry.
      if (item.activityId) void Promise.resolve().then(() => source.readNotifications?.([item.activityId!])).catch(() => {});
      else { const next = new Set(seen).add(item.id); viewedRequests.set(source, next); setSeen(next); }
    } catch { setError('تعذّر فتح الإشعار. حاول مجددًا.'); }
    finally { openingRef.current = false; setOpening(null); }
  }
  return <section className="cm-notification-feed" aria-label="الإشعارات والتحديثات">
    {unread > 0 && <div className="nf-feed-summary" role="status"><span>الإشعارات غير المقروءة</span><b>{new Intl.NumberFormat('ar').format(unread)}</b></div>}
    <div className="nf-feed-filters" role="group" aria-label="تصفية الإشعارات">{filters.map(option => <button key={option.id} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}{option.id === 'unread' && unread > 0 && <span>{new Intl.NumberFormat('ar').format(unread)}</span>}</button>)}</div>
    {(error || connectionError) && <div className="nf-feed-error" role="alert"><span>{error || connectionError}</span><button onClick={() => { setRetry(n => n + 1); onRetry?.(); }}>إعادة المحاولة</button></div>}
    {(loading || connectionsLoading) && !timeline.length && <div className="nf-feed-loading" role="status"><span/><span/><span/><span className="mi-sr-only">جارٍ تحميل الإشعارات…</span></div>}
    {!loading && !connectionsLoading && !error && !connectionError && !timeline.length && <MotionReveal key={filter} className="nf-feed-empty" duration={320} distance={6}><span>{filter === 'unread' ? <Check size={24}/> : <Bell size={23}/>}</span><h2>{empty.title}</h2><p>{empty.detail}</p>
      {filter !== 'all' && <MotionPressButton className="btn-secondary" onClick={() => setFilter('all')}>عرض كل التحديثات</MotionPressButton>}
      {filter === 'all' && onBrowse && <MotionPressButton className="btn-secondary" onClick={onBrowse}>استكشف الملفات</MotionPressButton>}
    </MotionReveal>}
    <div className="nf-feed-timeline">{timeline.map((entry,index)=>{
      const group=dayLabel(entry.at), showGroup=index===0||group!==dayLabel(timeline[index-1].at);
      const item=entry.type==='activity'?entry.row:null;
      const update=entry.type==='update'?entry.row:null;
      const style=update&&updateEvents[update.event];
      const Icon=entry.type==='fit'||style&&style[1]==='analysis'?Sparkles:
        style&&style[2]==='step'?Route:style&&style[2]==='account'?ShieldCheck:
        style&&style[1]==='membership'?Gift:HeartHandshake;
      const unread=entry.type==='curated'||entry.row.unread;
      const title=item?.title ?? (style ? style[0] : entry.type==='fit' ? `تحديث على توافقك مع ${entry.row.name}` :
        entry.type==='curated' ? `قُبل التعارف مع ${entry.row.name}` : '');
      const detail=item?.detail ?? (update ? actionLabel(update.event) : entry.type==='fit' ? 'عرض ما تغيّر' : 'عرض التعارف');
      const activate=async()=>{
        if(entry.type==='activity'){await open(entry.row);return;}
        if(entry.type==='curated'){onCuratedUpdate?.();return;}
        if(entry.type==='fit'){setOpenFit(entry.row.id);onCompatibilityRead?.(entry.row.id,entry.row.change.key);return;}
        if(!pushOwner||!openUpdate||openingRef.current)return;
        openingRef.current=true;setOpening(entry.id);setError('');
        try {
          await openUpdate({kind:'update',requestId:entry.row.target,event:entry.row.event});
          setMemberUpdates(rows=>rows.map(row=>row.id===entry.id?{...row,unread:false}:row));
          void notificationUpdates(pushOwner,entry.id).catch(()=>{});
        } catch {setError('تعذّر فتح هذا التحديث. حاول مجددًا.');}
        finally {openingRef.current=false;setOpening(null);}
      };
      return <div key={entry.id} className="nf-feed-entry">
        {showGroup&&<h2 className="nf-feed-day">{group}</h2>}
        <button className="cm-notification-row" data-unread={unread||undefined} data-kind={item?.kind??entry.type}
          disabled={Boolean(item&&!item.target)||opening!==null} aria-busy={opening===entry.id||undefined} onClick={()=>void activate()}>
          {item ? <span className="nf-feed-avatar"><PersonAvatar person={item.person} source={source}/><i><EventIcon item={item}/></i></span>
            : <span className="nf-member-update-icon" data-cue={style ? style[2] : undefined}><Icon size={17} aria-hidden="true"/></span>}
          <span className="nf-feed-copy"><span className="nf-feed-row-head"><strong>{title}</strong>{unread&&<i className="nf-feed-unread" aria-label="غير مقروء"/>}</span>
            <small>{detail}</small>
            <span className="nf-feed-meta">{unread&&<span className="nf-feed-read-state">جديد</span>}
              {entry.at&&<time dateTime={entry.at} title={fullDate.format(new Date(entry.at))}>{timeFormat.format(new Date(entry.at))}</time>}
              {item?.attention&&<em>بانتظارك</em>}</span>
          </span>
          {(!item||item.target)&&<ChevronLeft className="nf-feed-chevron" size={15} aria-hidden="true"/>}
        </button>
      </div>;
    })}</div>
    {fitDetail&&<CompatibilityChangeSheet name={fitDetail.name} change={fitDetail.change} fit={fitDetail.fit} onClose={()=>setOpenFit(undefined)}/>}
  </section>;
}
