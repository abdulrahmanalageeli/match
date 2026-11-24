import memberAr from '../member-copy.ts';
import {useMembershipAccess,MembershipPrompt} from '../membership/access';
import { useId, useState } from 'react';
import { ArrowLeft, Check, CircleMinus, LockKeyhole, MessageCircle, Ring, Search } from '../BrandIcons';
import { Brand } from '../Brand';
import { CapturePrivacyButton, CaptureWatermark } from '../privacy/CapturePrivacy';
import { PersonAvatar } from '../avatars/PersonAvatar';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { preferencePercentage } from '../compatibility/model';
import '../compatibility/score-tile.css';
import { CommunitySkeleton } from './CommunitySkeleton';
import { RequestHistory } from './RequestHistory';
import type { CommunitySource, Connection } from './data';
import './matches-overview.css';

type Props = {
  source: CommunitySource; connections: Connection[]; loading: boolean; error: string;
  onRetry: () => void; onBrowse: () => void; onProfile: (id: string) => void;
  onConversation: (id: string, origin: Element | null) => void;
  busy: boolean; onAccept: (id: string) => void; onDecline: (id: string) => void; onRemove: (id: string) => void;
};
const number = new Intl.NumberFormat('ar-SA');
const dates = new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short', calendar: 'gregory', timeZone: 'Asia/Riyadh' });
const stamp = (row: Connection) => Date.parse(row.updatedAt || row.createdAt || '') || 0;

export function MatchesOverview({ source, connections, loading, error, onRetry, onBrowse, onProfile, onConversation, busy, onAccept, onDecline, onRemove }: Props) {
  const {premium,connectionLimit,upgrade}=useMembershipAccess();
  const capacity=connectionLimit??(premium?2:1);
  const logoMaskId = useId();
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [query, setQuery] = useState('');
  const current = connections.filter(row => row.status === 'accepted').sort((a,b) => stamp(b)-stamp(a));
  const pending = connections.filter(row => row.status === 'pending');
  const search = query.trim().normalize('NFKC');
  const requests = pending.filter(row => (filter === 'all' || row.direction === filter) && (!search || row.person.alias.normalize('NFKC').includes(search)))
    .sort((a,b) => Number(b.direction === 'incoming')-Number(a.direction === 'incoming') || stamp(b)-stamp(a));
  const filters = [{id:'all',label:'الكل'}, {id:'incoming',label:'بانتظارك'}, {id:'outgoing',label:'المرسلة'}] as const;
  return <section className="screen-content cm-view mo-view">
    <header className="cm-header"><Brand /><CapturePrivacyButton scope="profile"/></header>
    <MotionReveal as="header" className="mo-heading" distance={8}><h1 tabIndex={-1}>التوافقات</h1></MotionReveal>
    {error && <div className="mo-empty" role="alert"><p>{error}</p><MotionPressButton className="btn-secondary" onClick={onRetry}>إعادة المحاولة</MotionPressButton></div>}
    {loading && !connections.length && !error ? <CommunitySkeleton variant="conversations" label="جارٍ تحضير مساحة التعارف…"/> : <>
      <section aria-labelledby="mo-current-title">
        <div className="mo-section-heading"><h2 id="mo-current-title">الارتباطات الحالية</h2><span>{number.format(current.length)} / {number.format(capacity)}</span></div>
        {current.length ? <div className="mo-current-grid">{current.map((row,index) => {
          const score = premium&&!row.person.compatibilityLocked?preferencePercentage(row.person.fit):null;
          const unread = row.unreadCount ? number.format(row.unreadCount) : null;
          return <MotionReveal as="article" key={row.id} className="mo-current-card" data-request-row={row.id} delay={Math.min(index*55,110)} distance={8}>
            <button className="mo-portrait-link" onClick={()=>onProfile(row.id)} aria-label={`عرض ملف ${row.person.alias}`}>
              <PersonAvatar person={row.person} source={source} className="mo-portrait"/>
              {(row.person.portrait || (!row.person.publicAvatar && row.person.demoPhoto)) && <CaptureWatermark scope="profile" variant="photo"/>}
            </button>
            <div className="mo-current-copy">
              <button className="mo-name" onClick={()=>onProfile(row.id)}>{row.person.alias}</button>
              <p>{[row.person.age > 0 ? number.format(row.person.age) : '',row.person.city].filter(Boolean).join(' · ')}</p>
              {row.person.exclusive && <span className="mo-exclusive">ارتباط حصري</span>}
              <button className="mo-remove-match" disabled={busy} onClick={()=>onRemove(row.id)} aria-label={`إنهاء التعارف مع ${row.person.alias}`}>إنهاء التعارف</button>
            </div>
            <div className="mo-current-actions">
            {score !== null && <span className="mo-compatibility-copy" role="img" aria-label={`توافق التفضيلات ${number.format(score)} من ١٠٠`}>
              <span className="mo-logo-progress" aria-hidden="true">
                <img className="mo-logo-track" src="/brand/wudayn-emblem-v2.png" alt="" width="48" height="48"/>
                <svg className="mo-logo-liquid" width="48" height="48" viewBox="0 0 48 48" focusable="false">
                  <defs><mask id={`${logoMaskId}-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
                    <g transform={`translate(0 ${48*(1-Math.max(0,Math.min(100,score))/100)})`}>
                      <path className="mo-logo-wave mo-logo-wave-back" d="M-48 0Q-36 -5 -24 0T0 0T24 0T48 0T72 0T96 0V100H-48Z" fill="white" opacity=".4"/>
                      <path className="mo-logo-wave" d="M-48 0Q-36 -8 -24 0T0 0T24 0T48 0T72 0T96 0V100H-48Z" fill="white"/>
                    </g>
                  </mask><mask id={`${logoMaskId}-shape-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48"><image href="/brand/wudayn-emblem-v2.png" width="48" height="48" style={{filter:'brightness(0) invert(1)'}}/></mask></defs>
                  <image href="/brand/wudayn-emblem-v2.png" width="48" height="48" opacity={score>0?1:0} mask={score>=100?undefined:`url(#${logoMaskId}-${index})`}/>
                  {score>0&&score<100&&<g mask={`url(#${logoMaskId}-shape-${index})`}>
                    <g transform={`translate(0 ${48*(1-score/100)})`}>
                      <path className="mo-logo-wave" d="M-48 0Q-36 -8 -24 0T0 0T24 0T48 0T72 0T96 0" fill="none" stroke="#fff7ef" strokeWidth=".9" strokeOpacity=".7"/>
                    </g>
                  </g>}
                </svg>
              </span>
              <span className="nf-score-tile mo-compatibility-caption"><span className="nf-score-tile-copy"><span>توافق التفضيلات</span><strong><bdi>{number.format(score)} من ١٠٠</bdi></strong></span></span>
            </span>}
            {!premium&&<button type="button" className="mo-action" onClick={()=>upgrade('premium')} aria-label="عرض العضوية لفتح نسبة التوافق"><LockKeyhole size={16} aria-hidden="true"/>فتح النسبة</button>}
            {score !== null && <span className="mo-action-divider" aria-hidden="true"/>}
            <MotionPressButton
              className="mo-action mo-action-current"
              aria-label={`فتح المحادثة مع ${row.person.alias}${unread ? `، ${unread} غير مقروءة` : ''}`}
              onClick={event=>onConversation(row.id,event.currentTarget.closest('.mo-current-card')?.querySelector('.mo-portrait')??null)}
            >
              <span className="mo-chat-symbol" aria-hidden="true"><MessageCircle size={18} strokeWidth={1.5}/>
                {unread && <span className="mo-unread">{unread}</span>}
              </span>
              <span>محادثة</span>
            </MotionPressButton>
            </div>
          </MotionReveal>;
        })}
          {current.length < capacity && !loading && !error && <article className="mo-empty-slot" aria-label="مساحة لارتباط جديد">
            <span className="mo-slot-symbol" aria-hidden="true"><Ring size={24} strokeWidth={1.3}/></span>
            <div><strong>مساحة لارتباط جديد</strong>
              <p>{current[0].person.exclusive ? 'غير متاحة أثناء الارتباط الحصري.' : `تتيح عضويتك ${number.format(capacity)} ارتباطات متزامنة.`}</p>
            </div>
          </article>}
        </div> : !error && <div className="mo-empty"><p>مساحتك لبداية جادّة مع الشخص المناسب.</p><MotionPressButton className="btn-secondary" onClick={onBrowse}>استكشف الملفات<ArrowLeft size={16}/></MotionPressButton></div>}
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
            <div className="mo-request-action">{incoming ? <div className="mo-request-decisions">
              <MotionPressButton className="mo-action mo-action-incoming" disabled={busy} onClick={()=>onAccept(row.id)} aria-label={`قبول طلب ${row.person.alias}`}><Check size={14}/>قبول</MotionPressButton>
              <MotionPressButton className="mo-action" disabled={busy} onClick={()=>onDecline(row.id)} aria-label={`رفض طلب ${row.person.alias}`}><CircleMinus size={14}/>رفض</MotionPressButton>
            </div> : <MotionPressButton className="mo-action" onClick={()=>onProfile(row.id)}>عرض الطلب<ArrowLeft size={14}/></MotionPressButton>}{date && <time dateTime={date}>{dates.format(new Date(date))}</time>}</div>
          </MotionReveal>;
        })}</div>
        {!requests.length && !error && <p className="mo-quiet-empty">{search?'لا توجد نتائج لهذا الاسم.':filter==='incoming'?'لا توجد طلبات بانتظار قرارك.':filter==='outgoing'?'لا توجد طلبات مرسلة.':memberAr.requestsEmpty}</p>}
      </section>
    </>}
    <MembershipPrompt detail="قبول الطلبات متاح لك مجانًا. مع العضوية المميزة يمكنك المبادرة واكتشاف تفاصيل التوافق."/>
    <div className="mo-history"><RequestHistory source={source} title="التعارفات السابقة"/></div>
  </section>;
}
