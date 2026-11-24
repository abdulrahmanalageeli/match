import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, CircleAlert, Download, HeartHandshake, ListFilter, LockKeyhole, MessageCircle, Sparkles, X, type LucideIcon } from '../BrandIcons';
import { deepSections, type DeepSnapshot, type DeepSection } from './deepCompatibilityModel';
import { readingCopy, deepMethodCopy, deepResearchCopy, deepResearchUrl } from './deepReportDocument';

// Two perspectives meeting: decorative paths never encode a score or prediction.
const paths: Record<DeepSection, [string, string]> = {
  summary: ['M24 88C82 14 112 14 170 88S258 162 316 88', 'M24 88C82 162 112 162 170 88S258 14 316 88'],
  strengths: ['M24 108C96 108 96 48 170 48S244 108 316 108', 'M24 128C96 128 96 68 170 68S244 128 316 128'],
  differences: ['M24 88C88 88 106 30 170 30S258 88 316 88', 'M24 88C88 88 106 146 170 146S258 88 316 88'],
  patterns: ['M24 118C90 118 88 20 170 88S250 156 316 58', 'M24 58C90 58 88 156 170 88S250 20 316 118'],
  expectations: ['M24 110C92 110 100 52 170 52S248 110 316 110', 'M24 66C92 66 100 124 170 124S248 66 316 66'],
  friction: ['M24 98C78 98 90 46 132 46S168 130 210 130S270 78 316 78', 'M24 78C78 78 90 130 132 130S168 46 210 46S270 98 316 98'],
  conversation: ['M24 114C96 114 104 38 170 38S244 114 316 114', 'M24 62C96 62 104 138 170 138S244 62 316 62'],
  conclusion: ['M24 88C92 12 126 22 170 88S248 164 316 88', 'M24 88C92 164 126 154 170 88S248 12 316 88'],
};
const findingKinds: Record<DeepSnapshot['findings'][number]['kind'], { label: string; icon: LucideIcon }> = {
  strength: { label: 'نقطة تجمعكما', icon: HeartHandshake },
  manageable: { label: 'مساحة للحوار', icon: MessageCircle },
  incompatibility: { label: 'يحتاج قرارًا واضحًا', icon: CircleAlert },
  uncertain: { label: 'مساحة للاستكشاف', icon: Sparkles },
};
const count = new Intl.NumberFormat('ar-SA');

function FindingBody({ paragraphs, section, ownSide, peerName }: { paragraphs: string[]; section: DeepSection; ownSide: string; peerName: string }) {
  const lead = paragraphs.findIndex(paragraph => !paragraph.trimEnd().endsWith('؟'));
  return <div className="wd-deep-finding-body">
    {paragraphs.map((paragraph, index) => {
      const portrait = section === 'patterns' && paragraph.match(/^(إليك|إلى [^:\n]{1,70}|لكلٍّ منكما|الطرف [أب])[:：]\s*([\s\S]+)/);
      if (portrait) {
        const label = portrait[1].startsWith('الطرف ') ? (portrait[1]===ownSide ? 'إليك' : 'إلى '+peerName) : portrait[1];
        return <p className="wd-deep-portrait" key={index}><strong>{label}</strong>{portrait[2]}</p>;
      }
      const outlook = section === 'conclusion' && paragraph.match(/^(فرصة بينكما|ما قد يصعب|من الآن)[:：]\s*([\s\S]+)/);
      if (outlook) return <p className="wd-deep-outlook-point" key={index}>
        <strong data-tone={outlook[1] === 'فرصة بينكما' ? 'positive' : undefined}>{outlook[1]}</strong>{outlook[2]}
      </p>;
      const discussion = paragraph.trimEnd().endsWith('؟');
      if (discussion) return <p key={index} className="wd-deep-discussion-prompt">
        <MessageCircle aria-hidden="true" size={17}/><span>{paragraph}</span>
      </p>;

      const emphasis = index === lead && section !== 'conversation';
      return <p key={index} className={emphasis ? 'wd-deep-takeaway' : undefined}>
        {emphasis ? paragraph.split(/(«[^»]+»)/).map((phrase, part) =>
          part % 2 ? <strong key={part}>{phrase}</strong> : phrase) : paragraph}
      </p>;
    })}
  </div>;
}

function ConnectionArtwork({ section }: { section: DeepSection }) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="wd-deep-art" data-paused={!visible || undefined} aria-hidden="true">
    <svg viewBox="0 0 340 176" fill="none" key={section}>
      <defs><linearGradient id={`${id}-rose`} x1="24" y1="30" x2="316" y2="146" gradientUnits="userSpaceOnUse"><stop stopColor="#d7b5c2"/><stop offset=".48" stopColor="#a34e73"/><stop offset="1" stopColor="#54152a"/></linearGradient><linearGradient id={`${id}-gold`} x1="24" y1="146" x2="316" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#b38e70"/><stop offset=".55" stopColor="#d7bb9f"/><stop offset="1" stopColor="#8f5366"/></linearGradient></defs>
      {paths[section].map((path, index) => <g key={index}>
        <path className="wd-deep-thread-soft" d={path} stroke={`url(#${id}-${index ? 'gold' : 'rose'})`} strokeWidth="13" opacity=".07"/>
        <path className="wd-deep-thread" d={path} stroke={`url(#${id}-${index ? 'gold' : 'rose'})`} strokeWidth="2.4" strokeLinecap="round" pathLength="100"/>
        <path className="wd-deep-thread-light" d={path} stroke={index ? '#fff4df' : '#f9dce8'} strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="5 95" style={{animationDelay:`${index * -4}s`}}/>
      </g>)}
    </svg>
    <span className="wd-deep-art-mark"><img src="/brand/wudayn-emblem-v2.png" alt="" width="52" height="52"/></span>
  </div>;
}

export function DeepReport({ snapshot, peerName, save, saving }: {
  snapshot: Pick<DeepSnapshot, 'requestedByMe' | 'findings'>; peerName: string; save?(): void; saving?: boolean;
}) {
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<'reading' | 'contents' | 'method'>('reading');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const activeChapter = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  const pointer = useRef<{x:number;y:number} | null>(null);
  const findings = Object.keys(deepSections).flatMap(section => snapshot.findings.filter(item => item.section === section));
  const index = Math.max(0, findings.findIndex(item => item.id === selected));
  const active = findings[index];
  // Local paired readings form a short opening. The index keeps every approved detail.
  const paired = findings.filter(item => item.id.startsWith('interaction-'));
  const sequence = active && paired.includes(active) ? paired : findings;
  const position = active ? sequence.indexOf(active) : 0;
  const next = sequence[position + 1];
  const copy = active && readingCopy(active.text);
  const conversation = findings.findIndex(item => item.section === 'conversation');
  const sections = Object.entries(deepSections).filter(([section]) => findings.some(item => item.section === section));
  const FindingIcon = active ? findingKinds[active.kind].icon : Sparkles;
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    if (view !== 'reading' || !moved.current) return;
    const frame = requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    moved.current = false;
    return () => cancelAnimationFrame(frame);
  }, [active?.id, view]);
  useEffect(() => {
    const chip = activeChapter.current;
    const chapters = chip?.parentElement;
    if (!chip || !chapters || chapters.scrollWidth <= chapters.clientWidth) return;
    const button = chip.getBoundingClientRect();
    const rail = chapters.getBoundingClientRect();
    // Keep chapter movement inside the rail. Scrolling ancestors can shift the RTL sheet mid-transition.
    chapters.scrollBy({ left: button.left + button.width / 2 - rail.left - rail.width / 2 });
  }, [active?.id, view]);
  function go(next: number) {
    if (!findings[next]) return;
    setDirection(next < index ? 'back' : 'forward');
    moved.current = true;
    setSelected(findings[next].id);
    setView('reading');
  }
  return <div className="wd-deep-experience" data-section={active?.section} data-view={view}>
    <div className="wd-deep-toolbar"><span><LockKeyhole size={13}/> خاص بكما</span>{save && <button type="button" disabled={saving || !findings.length} onClick={save}><Download size={16}/>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</button>}</div>
    <div className="wd-deep-story-scroll" ref={scroller}>
      {view === 'reading' && active ? <div className="wd-deep-story" data-direction={direction} key={active.id}>
        <div className="wd-deep-couple" aria-label={`قراءة مشتركة بينك وبين ${peerName}`}>
          <span><b aria-hidden="true">أ</b><small>أنت</small></span>
          <i aria-hidden="true"><img src="/brand/wudayn-emblem-v2.png" alt="" width="26" height="26"/></i>
          <span><b aria-hidden="true">{peerName.trim().charAt(0) || 'و'}</b><small>{peerName}</small></span>
        </div>
        <nav className="wd-deep-section-nav" aria-label="محاور التحليل">
          {sections.map(([section, label]) => <button type="button" key={section} ref={active.section === section ? activeChapter : undefined} aria-current={active.section === section ? 'page' : undefined} onClick={() => go(findings.findIndex(item => item.section === section))}>{label}</button>)}
        </nav>
        <ConnectionArtwork section={active.section}/>
        <article className="wd-deep-story-copy" data-kind={active.kind} aria-labelledby={`deep-finding-${active.id}`} onTouchStart={event => { const t=event.touches[0]; pointer.current={x:t.clientX,y:t.clientY}; }} onTouchEnd={event => {
          const start=pointer.current; pointer.current=null; if (!start) return;
          const t=event.changedTouches[0], dx=t.clientX-start.x, dy=t.clientY-start.y;
          if(Math.abs(dx)>65 && Math.abs(dx)>Math.abs(dy)*1.5) go(findings.indexOf(sequence[position+(dx>0?1:-1)]));
        }} onTouchCancel={() => { pointer.current=null; }}>
          <div className="wd-deep-finding-meta">
            <span><FindingIcon size={15}/>{findingKinds[active.kind].label}</span>
            <span aria-live="polite">{count.format(position + 1)} من {count.format(sequence.length)}</span>
          </div>
          <h3 id={`deep-finding-${active.id}`} ref={heading} tabIndex={-1}>{copy?.title || deepSections[active.section]}</h3>
          {copy && <FindingBody paragraphs={copy.body} section={active.section} ownSide={snapshot.requestedByMe?'الطرف أ':'الطرف ب'} peerName={peerName}/>}
          {active.section === 'summary' && conversation >= 0 && <button type="button" className="wd-deep-discuss" onClick={() => go(conversation)}>انتقل إلى سؤال الحوار <ArrowLeft size={16}/></button>}
          {active.kind === 'incompatibility' && <small className="wd-deep-condition"><CircleAlert size={15}/> تعارض مع شرط أساسي · يستحق نقاشًا واضحًا بينكما</small>}
        </article>
      </div> : view === 'contents' ? <div className="wd-deep-index"><span className="wd-deep-story-kicker">الصورة كاملة، في مكان واحد</span><h3>محاور تحليلكما</h3><p className="wd-deep-index-lead">{count.format(findings.length)} نقاط وافقتما على مشاركتها. اختارا أي نقطة للعودة إليها.</p><div className="wd-deep-index-grid">{findings.map((item, position) => {
        const ItemIcon = findingKinds[item.kind].icon;
        return <button key={item.id} type="button" data-kind={item.kind} onClick={() => go(position)}><span className="wd-deep-index-icon"><ItemIcon size={17}/></span><span><small>{deepSections[item.section]}</small><b>{readingCopy(item.text).title || deepSections[item.section]}</b></span><ArrowLeft size={17}/></button>;
      })}</div><p className="wd-deep-index-privacy"><LockKeyhole size={14}/> تظهر فقط النقاط التي وافقتما على مشاركتها.</p></div>
      : view === 'method' ? <div className="wd-deep-method"><span className="wd-deep-story-kicker">شفافية وُدَين</span><h3>كيف نقرأ إجاباتكما؟</h3><section><p>{deepMethodCopy}</p></section><section><h4>المرجع البحثي وحدوده</h4><p>{deepResearchCopy}</p><a href={deepResearchUrl} target="_blank" rel="noreferrer">Joel وآخرون · PNAS · 2020</a></section><section><h4>مشاركتكما، باختياركما</h4><p>لا يظهر إلا ما وافقتما على مشاركته. أسئلة الحوار اختيارية. النسخة المحفوظة تبقى خارج التطبيق حتى بعد سحب المشاركة.</p></section></div>
      : <p className="wd-deep-note">لم تتفقا على مشاركة نقاط. بقيت الإجابات خاصة بكل طرف.</p>}
    </div>
    <div className="wd-deep-navigation">
      {view === 'reading' && active ? <>
        <div className="wd-deep-progress"><span style={{ width: `${((position + 1) / sequence.length) * 100}%` }}/></div>
        <div className="wd-deep-next-row"><button type="button" className="wd-deep-back" disabled={position===0} onClick={()=>go(findings.indexOf(sequence[position-1]))} aria-label="النقطة السابقة"><ArrowRight size={20}/></button><button type="button" className="wd-deep-next" onClick={()=>next?go(findings.indexOf(next)):setView('contents')}><span><small>{next?'التالي':sequence===paired?'اكتملت قراءة الشخصيتين':'اكتملت القراءة'}</small>{next?(readingCopy(next.text).title || deepSections[next.section]):'استعراض كل المحاور'}</span><ArrowLeft size={19}/></button></div>
      </> : <button type="button" className="wd-deep-return" onClick={()=>setView('reading')}><X size={17}/> العودة إلى آخر نقطة</button>}
      <div className="wd-deep-utilities"><button type="button" aria-current={view==='contents'?'page':undefined} onClick={()=>setView(view==='contents'?'reading':'contents')}><ListFilter size={16}/> المحاور</button><button type="button" aria-current={view==='method'?'page':undefined} onClick={()=>setView(view==='method'?'reading':'method')}><BookOpen size={16}/> المنهجية</button></div>
    </div>
  </div>;
}
