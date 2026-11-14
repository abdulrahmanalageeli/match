import { useState } from 'react';
import { ArrowLeft, Check, Clock3, Heart, MessageCircle, Search } from "../BrandIcons";
import { Brand } from '../Brand';
import { PersonAvatar } from '../avatars/PersonAvatar';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import { preferencePercentage } from '../compatibility/model';
import { CommunitySkeleton } from './CommunitySkeleton';
import type { CommunitySource, Connection } from './data';
import './matches-overview.css';

type Props = {
  source: CommunitySource; connections: Connection[]; loading: boolean; error: string;
  onRetry: () => void; onBrowse: () => void; onProfile: (id: string) => void;
  onConversation: (id: string, origin: Element | null) => void;
};
type Filter = 'all' | 'accepted' | 'incoming' | 'outgoing';
const number = new Intl.NumberFormat('ar-SA');
const dates = new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short', calendar: 'gregory', timeZone: 'Asia/Riyadh' });
const filters: { id: Filter; label: string }[] = [{ id: 'all', label: 'الكل' }, { id: 'accepted', label: 'الحالي' }, { id: 'incoming', label: 'بانتظارك' }, { id: 'outgoing', label: 'بانتظار الرد' }];
const stamp = (row: Connection) => Date.parse(row.updatedAt || row.createdAt || '') || 0;

export function MatchesOverview({ source, connections, loading, error, onRetry, onBrowse, onProfile, onConversation }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const accepted = connections.filter(row => row.status === 'accepted').length;
  const incoming = connections.filter(row => row.status === 'pending' && row.direction === 'incoming').length;
  const outgoing = connections.filter(row => row.status === 'pending' && row.direction === 'outgoing').length;
  const counts = { all: connections.length, accepted, incoming, outgoing };
  const search = query.trim().normalize('NFKC');
  const rows = connections.filter(row => (filter === 'all' || (filter === 'accepted' ? row.status === 'accepted' : row.status === 'pending' && row.direction === filter))
    && (!search || row.person.alias.normalize('NFKC').includes(search)))
    .sort((a, b) => Number(b.status === 'accepted') - Number(a.status === 'accepted') || stamp(b) - stamp(a));
  return <section className="screen-content cm-view mo-view">
    <header className="cm-header"><Brand /></header>
    <MotionReveal as="header" className="mo-heading" distance={8}>
      <h1 tabIndex={-1}>التعارف</h1>
      <p>تعارفاتك الحالية والطلبات الواردة والصادرة.</p>
    </MotionReveal>
    <MotionReveal className="mo-summary" delay={60} distance={8}>
      <span className="mo-summary-symbol"><Heart size={23} strokeWidth={1.4}/></span>
      <div><strong>{accepted ? `${number.format(accepted)} تعارف حالي` : incoming ? `${number.format(incoming)} طلب بانتظارك` : outgoing ? `${number.format(outgoing)} طلب بانتظار الرد` : 'لا يوجد تعارف حالي'}</strong><span>{accepted >= 2 ? 'وصلت إلى الحد الأقصى: تعارفان متزامنان' : incoming ? 'راجع الطلب وخذ وقتك في القرار' : outgoing ? 'سنخبرك عندما يصل الرد' : accepted ? 'يمكنك بدء تعارف آخر' : 'يمكنك بدء تعارفين في الوقت نفسه'}</span></div>
      <span className="mo-capacity" aria-label={`${accepted} من أصل تعارفين`}><i data-filled={accepted > 0 || undefined}/><i data-filled={accepted > 1 || undefined}/></span>
    </MotionReveal>
    <div className="mo-filters" role="group" aria-label="تصفية التعارف">
      {filters.map(item => <MotionPressButton key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{number.format(counts[item.id])}</span></MotionPressButton>)}
    </div>
    {(connections.length > 4 || query) && <label className="mo-search"><Search size={17}/><input type="search" aria-label="البحث بالاسم" placeholder="ابحث بالاسم" value={query} onChange={event => setQuery(event.target.value)}/></label>}
    {error && <div className="mo-empty" role="alert"><p>{error}</p><MotionPressButton className="btn-secondary" onClick={onRetry}>إعادة المحاولة</MotionPressButton></div>}
    {loading && !connections.length && !error && <CommunitySkeleton variant="conversations" label="جارٍ تحضير مساحة التعارف…"/>}
    {!loading && !error && !rows.length && <MotionReveal className="mo-empty" key={filter} distance={6}>
      <Heart size={27} strokeWidth={1.3}/>
      <h2>{search ? 'لم نجد هذا الاسم' : filter === 'incoming' ? 'لا توجد طلبات بانتظارك' : filter === 'outgoing' ? 'لم ترسل طلبًا بعد' : filter === 'accepted' ? 'لا يوجد تعارف حالي' : 'لا توجد طلبات تعارف بعد'}</h2>
      <p>{search ? 'جرّب اسمًا آخر أو امسح البحث.' : 'تصفّح الملفات وأرسل طلب تعارف. تُفتح المحادثة بعد قبول الطرف الآخر.'}</p>
      <MotionPressButton className="btn-secondary" onClick={search ? () => setQuery('') : onBrowse}>{search ? 'مسح البحث' : 'استكشف الملفات'}<ArrowLeft size={16}/></MotionPressButton>
    </MotionReveal>}
    <div className="mo-list" aria-label="التعارف الحالي والطلبات" aria-busy={loading}>
      {rows.map((row, index) => {
        const current = row.status === 'accepted', waiting = !current && row.direction === 'incoming';
        const score = preferencePercentage(row.person.fit);
        const date = row.createdAt && Number.isFinite(Date.parse(row.createdAt)) ? row.createdAt : undefined;
        return <MotionReveal as="article" key={row.id} className="mo-card" data-current={current || undefined} data-request-row={row.id} delay={Math.min(index * 35, 140)} distance={8}>
          <div className="mo-card-status"><span data-waiting={waiting || undefined}>{current ? <Check size={13}/> : <Clock3 size={13}/>} {row.person.exclusive ? 'تعارف حصري' : current ? 'قبول متبادل' : waiting ? 'بانتظار قرارك' : 'طلبك قيد الانتظار'}</span>{date && <time dateTime={date}>{dates.format(new Date(date))}</time>}</div>
          <button type="button" className="mo-profile" onClick={() => onProfile(row.id)} aria-label={`عرض ملف ${row.person.alias}`}>
            <PersonAvatar person={row.person} source={source} className="mo-avatar cm-avatar"/>
            <span className="mo-identity"><strong>{row.person.alias}<small>{row.person.age > 0 ? number.format(row.person.age) : ''}</small></strong><span>{[row.person.city, row.person.occupation].filter(Boolean).join(' · ')}</span>{score !== null && <span className="mo-fit">{number.format(score)}٪ توافق التفضيلات</span>}</span>
            <ArrowLeft className="mo-profile-arrow" size={17}/>
          </button>
          <div className="mo-card-foot">
            <span>{current ? row.unreadCount ? `${number.format(row.unreadCount)} رسائل جديدة` : 'يمكنكما متابعة المحادثة' : waiting ? 'راجع الملف للقبول أو الاعتذار' : 'سنخبرك عندما يصلك الرد'}</span>
            <MotionPressButton className={current ? 'mo-action mo-action-current' : 'mo-action'} onClick={event => current ? onConversation(row.id, event.currentTarget.closest('.mo-card')?.querySelector('.mo-avatar') ?? null) : onProfile(row.id)}>{current ? <MessageCircle size={16}/> : <ArrowLeft size={15}/>} {current ? 'المحادثة' : waiting ? 'مراجعة الطلب' : 'عرض الطلب'}</MotionPressButton>
          </div>
        </MotionReveal>;
      })}
    </div>
  </section>;
}
