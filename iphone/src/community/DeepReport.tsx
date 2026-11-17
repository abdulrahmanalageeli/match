import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Download, ListFilter, LockKeyhole, X } from '../BrandIcons';
import { deepSections, type DeepSnapshot, type DeepSection } from './deepCompatibilityModel';
import { deepMethodCopy, deepResearchCopy, deepResearchUrl } from './deepReportDocument';

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
const captions: Record<DeepSection, string> = {
  summary: 'صورتكما، أقرب', strengths: 'أرضية تبنيان عليها', differences: 'مساحتان… وحوار واحد',
  patterns: 'المعنى خلف الإجابة', expectations: 'ما ينتظره كل منكما', friction: 'نفهم قبل أن نحكم',
  conversation: 'من القراءة إلى الحوار', conclusion: 'الخطوة التالية لكما',
};

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
  snapshot: DeepSnapshot; peerName: string; save(): void; saving: boolean;
}) {
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<'reading' | 'contents' | 'method'>('reading');
  const scroller = useRef<HTMLDivElement>(null);
  const pointer = useRef<{x:number;y:number} | null>(null);
  const findings = Object.keys(deepSections).flatMap(section => snapshot.findings.filter(item => item.section === section));
  const index = Math.max(0, findings.findIndex(item => item.id === selected));
  const active = findings[index];
  const sections = Object.entries(deepSections).filter(([section]) => findings.some(item => item.section === section));
  const count = new Intl.NumberFormat('ar-SA');
  useEffect(() => { scroller.current?.scrollTo({top:0}); }, [active?.id, view]);
  function go(next: number) { if (findings[next]) { setSelected(findings[next].id); setView('reading'); } }
  return <div className="wd-deep-experience">
    <div className="wd-deep-toolbar"><span><LockKeyhole size={12}/> خاص بكما</span><button type="button" disabled={saving || !findings.length} onClick={save}><Download size={16}/>{saving ? 'جارٍ الحفظ…' : 'حفظ نسخة'}</button></div>
    <div className="wd-deep-story-scroll" ref={scroller}>
      {view === 'reading' && active ? <div className="wd-deep-story" key={active.id}>
        <div className="wd-deep-couple"><span><b>أنت</b><small>الطرف {snapshot.requestedByMe ? 'أ' : 'ب'}</small></span><i aria-hidden="true"/><span><b>{peerName}</b><small>الطرف {snapshot.requestedByMe ? 'ب' : 'أ'}</small></span></div>
        <div onTouchStart={event => { const t=event.touches[0]; pointer.current={x:t.clientX,y:t.clientY}; }} onTouchEnd={event => {
          const start=pointer.current; pointer.current=null; if (!start) return;
          const t=event.changedTouches[0], dx=t.clientX-start.x, dy=t.clientY-start.y;
          if(Math.abs(dx)>65 && Math.abs(dx)>Math.abs(dy)*1.5) go(index+(dx>0?1:-1));
        }} onTouchCancel={() => { pointer.current=null; }}><ConnectionArtwork section={active.section}/></div>
        <div className="wd-deep-story-copy" role="region" aria-label={deepSections[active.section]}>
          <span className="wd-deep-story-kicker">{captions[active.section]}</span>
          <h3>{deepSections[active.section]}</h3>
          <p>{active.text}</p>
          {active.kind === 'incompatibility' && <small className="wd-deep-condition">تعارض مع شرط أساسي · يستحق نقاشًا واضحًا بينكما</small>}
        </div>
      </div> : view === 'contents' ? <div className="wd-deep-index"><span className="wd-deep-story-kicker">اكتشفا الصورة كاملة</span><h3>محاور تحليلكما</h3>{sections.map(([section,label], position) => <button key={section} type="button" onClick={() => go(findings.findIndex(item => item.section===section))}><span>{count.format(position+1).padStart(2,'٠')}</span><b>{label}</b><ArrowLeft size={17}/></button>)}<p>تظهر فقط النقاط التي وافقتما على مشاركتها.</p></div>
      : view === 'method' ? <div className="wd-deep-method"><span className="wd-deep-story-kicker">شفافية وُدَين</span><h3>كيف نقرأ إجاباتكما؟</h3><p>{deepMethodCopy}</p><h4>المرجع البحثي وحدوده</h4><p>{deepResearchCopy}</p><a href={deepResearchUrl} target="_blank" rel="noreferrer">Joel وآخرون · PNAS · 2020</a><h4>مشاركتكما، باختياركما</h4><p>لا يظهر إلا ما وافقتما على مشاركته. أسئلة الحوار اختيارية. النسخة المحفوظة تبقى خارج التطبيق حتى بعد سحب المشاركة.</p></div>
      : <p className="wd-deep-note">لم تتفقا على مشاركة نقاط. بقيت الإجابات خاصة بكل طرف.</p>}
    </div>
    <div className="wd-deep-navigation">
      {view === 'reading' && active && <><div className="wd-deep-chapters" aria-label="محاور التحليل">{sections.map(([section,label]) => <button type="button" key={section} aria-label={label} aria-current={active.section === section ? 'step' : undefined} onClick={() => go(findings.findIndex(item=>item.section===section))}/>)}</div>
        <div className="wd-deep-next-row"><button type="button" className="wd-deep-back" disabled={index===0} onClick={()=>go(index-1)} aria-label="القراءة السابقة"><ArrowRight size={20}/></button><span aria-live="polite">{count.format(index+1)} <i>/</i> {count.format(findings.length)}</span><button type="button" className="wd-deep-next" onClick={()=>index<findings.length-1?go(index+1):setView('contents')}>{index<findings.length-1?'نكمل القراءة':'استعراض المحاور'}<ArrowLeft size={18}/></button></div></>}
      <div className="wd-deep-utilities"><button type="button" onClick={()=>setView(view==='contents'?'reading':'contents')}>{view==='contents'?<X size={15}/>:<ListFilter size={15}/>} {view==='contents'?'العودة للتحليل':'المحاور'}</button><button type="button" onClick={()=>setView(view==='method'?'reading':'method')}>{view==='method'?<X size={15}/>:<BookOpen size={15}/>} {view==='method'?'العودة للتحليل':'المنهجية'}</button></div>
    </div>
  </div>;
}
