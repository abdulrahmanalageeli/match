import { useState } from 'react';
import { ArrowLeft, MessageCircle, Search } from '../BrandIcons';
import { Brand } from '../Brand';
import { PersonAvatar } from '../avatars/PersonAvatar';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { preferencePercentage } from '../compatibility/model';
import { ScoreTile } from '../compatibility/ScoreTile';
import { CommunitySkeleton } from './CommunitySkeleton';
import { RequestHistory } from './RequestHistory';
import type { CommunitySource, Connection } from './data';
import './matches-overview.css';

type Props = {
  source: CommunitySource; connections: Connection[]; loading: boolean; error: string;
  onRetry: () => void; onBrowse: () => void; onProfile: (id: string) => void;
  onConversation: (id: string, origin: Element | null) => void;
};
const number = new Intl.NumberFormat('ar-SA');
const dates = new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short', calendar: 'gregory', timeZone: 'Asia/Riyadh' });
const stamp = (row: Connection) => Date.parse(row.updatedAt || row.createdAt || '') || 0;

export function MatchesOverview({ source, connections, loading, error, onRetry, onBrowse, onProfile, onConversation }: Props) {
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [query, setQuery] = useState('');
  const current = connections.filter(row => row.status === 'accepted').sort((a,b) => stamp(b)-stamp(a));
  const pending = connections.filter(row => row.status === 'pending');
  const search = query.trim().normalize('NFKC');
  const requests = pending.filter(row => (filter === 'all' || row.direction === filter) && (!search || row.person.alias.normalize('NFKC').includes(search)))
    .sort((a,b) => Number(b.direction === 'incoming')-Number(a.direction === 'incoming') || stamp(b)-stamp(a));
  const filters = [{id:'all',label:'الكل'}, {id:'incoming',label:'بانتظارك'}, {id:'outgoing',label:'المرسلة'}] as const;
  return <section className="screen-content cm-view mo-view">
    <header className="cm-header"><Brand /></header>
    <MotionReveal as="header" className="mo-heading" distance={8}><h1 tabIndex={-1}>التعارف</h1></MotionReveal>
    {error && <div className="mo-empty" role="alert"><p>{error}</p><MotionPressButton className="btn-secondary" onClick={onRetry}>إعادة المحاولة</MotionPressButton></div>}
    {loading && !connections.length && !error ? <CommunitySkeleton variant="conversations" label="جارٍ تحضير مساحة التعارف…"/> : <>
      <section aria-labelledby="mo-current-title">
        <div className="mo-section-heading"><h2 id="mo-current-title">الارتباطات الحالية</h2><span>{number.format(current.length)} / ٢</span></div>
        {current.length ? <div className="mo-current-grid">{current.map((row,index) => {
          const score = preferencePercentage(row.person.fit);
          const unread = row.unreadCount ? number.format(row.unreadCount) : null;
          return <MotionReveal as="article" key={row.id} className="mo-current-card" data-request-row={row.id} delay={Math.min(index*55,110)} distance={8}>
            <button className="mo-portrait-link" onClick={()=>onProfile(row.id)} aria-label={`عرض ملف ${row.person.alias}`}>
              <PersonAvatar person={row.person} source={source} className="mo-portrait"/>
            </button>
            <div className="mo-current-copy">
              <button className="mo-name" onClick={()=>onProfile(row.id)}>{row.person.alias}</button>
              <p>{[row.person.age > 0 ? number.format(row.person.age) : '',row.person.city].filter(Boolean).join(' · ')}</p>
              {score !== null && <ScoreTile percentage={score} />}
              {row.person.exclusive && <span className="mo-exclusive">ارتباط حصري</span>}
            </div>
            <MotionPressButton
              className="mo-action mo-action-current"
              aria-label={`فتح المحادثة مع ${row.person.alias}${unread ? `، ${unread} غير مقروءة` : ''}`}
              onClick={event=>onConversation(row.id,event.currentTarget.closest('.mo-current-card')?.querySelector('.mo-portrait')??null)}
            >
              <MessageCircle size={18} strokeWidth={1.5} aria-hidden="true"/>
              {unread && <span className="mo-unread" aria-hidden="true">{unread}</span>}
            </MotionPressButton>
          </MotionReveal>;
        })}</div> : !error && <div className="mo-empty"><p>مساحتك لبداية جادّة مع الشخص المناسب.</p><MotionPressButton className="btn-secondary" onClick={onBrowse}>استكشف الملفات<ArrowLeft size={16}/></MotionPressButton></div>}
      </section>
      <section className="mo-requests" aria-labelledby="mo-requests-title">
        <div className="mo-section-heading"><h2 id="mo-requests-title">طلبات التعارف</h2><span>{number.format(pending.length)}</span></div>
        {pending.length > 0 && <div className="mo-filters" role="group" aria-label="تصفية الطلبات">{filters.map(item=><MotionPressButton key={item.id} aria-pressed={filter===item.id} onClick={()=>setFilter(item.id)}>{item.label}<span>{number.format(item.id==='all'?pending.length:pending.filter(row=>row.direction===item.id).length)}</span></MotionPressButton>)}</div>}
        {(pending.length>4 || query) && <label className="mo-search"><Search size={16}/><input type="search" aria-label="البحث بالاسم" placeholder="ابحث بالاسم" value={query} onChange={event=>setQuery(event.target.value)}/></label>}
        <div className="mo-request-list" aria-busy={loading}>{requests.map((row,index)=>{
          const incoming=row.direction==='incoming';
          const date=Number.isFinite(Date.parse(row.createdAt||''))?row.createdAt:undefined;
          return <MotionReveal as="article" className="mo-request" key={row.id} data-request-row={row.id} delay={Math.min(index*30,90)} distance={5}>
            <button className="mo-request-profile" onClick={()=>onProfile(row.id)} aria-label={`عرض ملف ${row.person.alias}`}>
              <PersonAvatar person={row.person} source={source} className="mo-request-avatar"/>
              <span className="mo-identity"><strong>{row.person.alias}</strong><span>{[row.person.age>0?number.format(row.person.age):'',row.person.city].filter(Boolean).join(' · ')}</span><small data-incoming={incoming||undefined}>{incoming?'بانتظارك':'بانتظار الرد'}</small></span>
            </button>
            <div className="mo-request-action"><MotionPressButton className={`mo-action${incoming?' mo-action-incoming':''}`} onClick={()=>onProfile(row.id)}>{incoming?'مراجعة الطلب':'عرض الطلب'}<ArrowLeft size={14}/></MotionPressButton>{date && <time dateTime={date}>{dates.format(new Date(date))}</time>}</div>
          </MotionReveal>;
        })}</div>
        {!requests.length && !error && <p className="mo-quiet-empty">{search?'لا توجد نتائج لهذا الاسم.':filter==='incoming'?'لا توجد طلبات بانتظار قرارك.':filter==='outgoing'?'لا توجد طلبات مرسلة.':'ستظهر الطلبات الجديدة هنا.'}</p>}
      </section>
    </>}
    <div className="mo-history"><RequestHistory source={source} title="التعارفات السابقة"/></div>
  </section>;
}
