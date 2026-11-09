import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Image, LoaderCircle, LockKeyhole, MessageCircle, Mic, Search, X } from "../BrandIcons";
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import type { CommunitySource, Message } from './data';
import { MessageMedia } from './ChatMedia';
import { refreshHistoricalMessages } from './messageRefresh';
import './chat-library.css';

const pageSize = 50;
const dates = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const tabs = [{ kind: undefined, label: 'الكل' }, { kind: 'photo', label: 'الصور' }, { kind: 'audio', label: 'الصوتيات' }] as const;
type Kind = 'photo' | 'audio' | undefined;
function available(message: Message, kind: Kind) {
  return !message.deletedAt && !message.attachment?.viewOnce && (!kind || message.attachment?.kind === kind);
}
function combine(...groups: Message[][]) {
  return [...new Map(groups.flat().map(message => [message.id, message])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
function stamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dates.format(date);
}

export function ChatLibrary({ source, requestId, name, onClose, onJump }: {
  source: CommunitySource; requestId: string; name: string; onClose: () => void; onJump: (messageId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), search = useRef<HTMLInputElement>(null);
  const more = useRef<() => void>(() => {}), dismiss = useRef(onClose); dismiss.current = onClose;
  const [query, setQuery] = useState(''), [settledQuery, setSettledQuery] = useState('');
  const [kind, setKind] = useState<Kind>(undefined), [rows, setRows] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true), [loadingOlder, setLoadingOlder] = useState(false), [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [privateHidden, setPrivateHidden] = useState(document.hidden);
  const panelId = useId(), pendingQuery = query.trim() !== settledQuery;
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => { node?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let active = true, fetching = false, dirty = false, epoch = 0;
    let current: Message[] = [], cursor: string | undefined, historical = false;
    let timer: number | undefined;
    setRows([]); setLoading(true); setLoadingOlder(false); setHasOlder(false); setError('');
    async function load(older = false) {
      if (!active || document.hidden || !source.searchMessages) { if (active && !source.searchMessages) setLoading(false); return; }
      if (fetching) { if (!older) dirty = true; return; }
      const ticket = epoch;
      fetching = true;
      if (older) setLoadingOlder(true);
      try {
        const page = await source.searchMessages(requestId, settledQuery, older ? cursor : undefined, kind);
        if (!active || ticket !== epoch) return;
        let history: Message[] = [];
        if (!older && historical && current.length) history = await refreshHistoricalMessages(source, requestId, current, page);
        if (!active || ticket !== epoch) return;
        current = combine(older ? current : history, page).filter(message => available(message, kind));
        if (older) historical = true;
        if (older || !historical) { cursor = page[0]?.id; setHasOlder(page.length === pageSize); }
        setRows(current); setError('');
      } catch {
        if (active && ticket === epoch) {
          current = []; cursor = undefined; historical = false; setRows([]); setHasOlder(false);
          setError('تعذّر تحميل نتائج المحادثة. حاول مجددًا.');
        }
      } finally {
        fetching = false;
        if (active) { setLoading(false); setLoadingOlder(false); if (dirty) { dirty = false; void load(); } }
      }
    }
    function refresh() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void load(); }, 250);
    }
    function visibility() {
      setPrivateHidden(document.hidden);
      if (document.hidden) {
        epoch++; current = []; cursor = undefined; historical = false; setRows([]); setHasOlder(false);
        window.clearTimeout(timer);
      } else { setLoading(true); void load(); }
    }
    more.current = () => { if (cursor) void load(true); };
    void load();
    const unwatch = source.watch(refresh);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false; epoch++; window.clearTimeout(timer); unwatch(); more.current = () => {};
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [source, requestId, settledQuery, kind, retry]);

  const results = pendingQuery || privateHidden ? [] : [...rows].reverse();
  const waiting = loading || pendingQuery;
  return <dialog ref={dialog} className="cm-chat-library" dir="rtl" aria-label="البحث والوسائط المشتركة"
    onCancel={event => { event.preventDefault(); dismiss.current(); }}>
    <MotionReveal className="cm-library-shell" distance={14} duration={300}>
      <header className="cm-library-head">
        <div><span>محادثتك مع {name}</span><h2>البحث والوسائط</h2></div>
        <MotionPressButton aria-label="إغلاق البحث والوسائط" onClick={onClose} autoFocus><X size={21}/></MotionPressButton>
      </header>
      <div className="cm-library-search"><Search size={19} aria-hidden="true"/>
        <input ref={search} type="search" value={query} maxLength={100} placeholder="ابحث في الرسائل…" aria-label="البحث في رسائل المحادثة"
          onChange={event => setQuery(event.target.value)} autoComplete="off" enterKeyHint="search"/>
        {query && <button type="button" aria-label="مسح البحث" onClick={() => { setQuery(''); search.current?.focus(); }}><X size={16}/></button>}
      </div>
      <div className="cm-library-tabs" role="tablist" aria-label="نوع نتائج المحادثة">
        {tabs.map((tab, index) => <MotionPressButton key={tab.label} role="tab" aria-selected={kind === tab.kind} aria-controls={panelId}
          tabIndex={kind === tab.kind ? 0 : -1} onClick={() => setKind(tab.kind)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowLeft' ? 1 : 2)) % 3;
            setKind(tabs[next].kind);
            (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
          }}>{tab.kind === 'photo' ? <Image size={16}/> : tab.kind === 'audio' ? <Mic size={16}/> : <MessageCircle size={16}/>}<span>{tab.label}</span></MotionPressButton>)}
      </div>
      <div className="cm-library-results" role="tabpanel" id={panelId} aria-label="نتائج البحث والوسائط" aria-busy={waiting || loadingOlder}>
        {privateHidden ? <div className="cm-library-empty"><LockKeyhole size={26}/><p>مساحتكما الخاصة</p></div> : <>
          {waiting && <div className="cm-library-loading" role="status"><LoaderCircle size={20}/><span>جارٍ البحث…</span></div>}
          {!waiting && error && <div className="cm-library-empty" role="alert"><p>{error}</p><MotionPressButton onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</MotionPressButton></div>}
          {!waiting && !error && !results.length && <MotionReveal className="cm-library-empty" distance={6} duration={220}>
            <span className="cm-library-empty-icon">{settledQuery ? <Search size={25}/> : kind === 'audio' ? <Mic size={25}/> : <Image size={25}/>}</span>
            <h3>{settledQuery ? 'لا توجد نتائج بعد' : 'كل ما تشاركانه، هنا'}</h3>
            <p>{!source.searchMessages ? 'البحث غير متاح لهذه المحادثة حاليًا.' : settledQuery ? 'جرّب كلمة أخرى أو غيّر نوع النتائج.' : 'ستجد هنا الصور والتسجيلات القابلة للرجوع إليها.'}</p>
          </MotionReveal>}
          <div className="cm-library-grid">
            {results.map(message => <MotionReveal key={message.id} as="article" className={`cm-library-card ${message.attachment?.kind || 'text'}`} distance={5} duration={230}>
              {message.attachment ? <MessageMedia source={source} requestId={requestId} attachment={message.attachment} senderIsMe={message.senderIsMe}/>
                : <button type="button" className="cm-library-text" onClick={() => onJump(message.id)}><p dir="auto">{message.body}</p></button>}
              <footer><span>{message.senderIsMe ? 'أنت' : name}<time dateTime={message.createdAt}>{stamp(message.createdAt)}</time></span>
                <MotionPressButton className="cm-library-jump" aria-label="الانتقال إلى الرسالة في المحادثة" onClick={() => onJump(message.id)}><ArrowUpRight size={17}/></MotionPressButton>
              </footer>
            </MotionReveal>)}
          </div>
          {!waiting && !error && hasOlder && <MotionPressButton className="cm-library-more" disabled={loadingOlder} onClick={() => more.current()}>{loadingOlder ? 'جارٍ تحميل المزيد…' : 'نتائج أقدم'}</MotionPressButton>}
        </>}
      </div>
      <footer className="cm-library-note"><LockKeyhole size={13}/><span>بينكما فقط · صور العرض لمرة واحدة لا تظهر هنا</span></footer>
    </MotionReveal>
  </dialog>;
}
