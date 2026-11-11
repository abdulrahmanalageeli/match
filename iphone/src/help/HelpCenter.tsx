import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, CircleHelp, Search, X } from "../BrandIcons";
import { helpTopics, searchGuide, type HelpTopic } from './guide';
import './help.css';
import { SupportContact } from './SupportContact';

export function HelpButton({topic='all',label='دليلك في وُدَين'}:{topic?:HelpTopic;label?:string}){
 const [open,setOpen]=useState(false);
 return <><button className="nf-help-link" type="button" onClick={()=>setOpen(true)} aria-haspopup="dialog"><CircleHelp size={15} aria-hidden="true"/>{label}</button>{open&&<HelpCenter initialTopic={topic} close={()=>setOpen(false)}/>}</>;
}
export function HelpCenter({initialTopic='all',close}:{initialTopic?:HelpTopic;close:()=>void}){
 const [topic,setTopic]=useState<HelpTopic>(initialTopic),[query,setQuery]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);const titleId=useId();
 useEffect(()=>{const el=dialog.current;el?.showModal();heading.current?.focus({preventScroll:true});return()=>el?.close();},[]);
 const results=searchGuide(topic,query);
 return <dialog ref={dialog} className="nf-help" dir="rtl" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();close();}}>
  <header><span className="nf-help-mark"><BookOpen size={24}/></span><button className="icon-btn" onClick={close} aria-label="إغلاق الدليل"><X size={20}/></button></header>
  <p className="nf-help-eyebrow">خطوة واضحة، وقرار مطمئن</p><h2 ref={heading} tabIndex={-1} id={titleId}>دليلك في وُدَين</h2><p className="nf-help-intro">إجابات قريبة، وقت ما تحتاجها.</p>
  <label className="nf-help-search"><Search size={17}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="مثل: الحصرية، الصور، المكالمات…" aria-label="ابحث في دليل وُدَين" maxLength={100}/>{query&&<button onClick={()=>setQuery('')} aria-label="مسح بحث الدليل"><X size={15}/></button>}</label>
  <div className="nf-help-topics" role="group" aria-label="مواضيع الدليل">{helpTopics.map(t=><button key={t.id} aria-pressed={topic===t.id} onClick={()=>setTopic(t.id)}>{t.label}</button>)}</div>
  <p className="nf-help-count" role="status">{new Intl.NumberFormat('ar').format(results.length)} إجابة{topic!=='all'&&query?' في هذا القسم':''}</p>
  <div className="nf-help-answers" key={topic}>{results.map(item=><details key={item.id}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
  {!results.length&&<div className="nf-help-empty"><CircleHelp size={24}/><h3>لنجرّب صياغة أبسط</h3><p>ابحث بكلمة مثل «صور» أو «مدة»، أو اعرض جميع الأقسام.</p><button className="btn-secondary" onClick={()=>{setQuery('');setTopic('all');}}>عرض جميع الإجابات</button></div>}
  <SupportContact />
  <footer>ستجد هذا الدليل دائمًا في الإعدادات.</footer>
 </dialog>;
}
