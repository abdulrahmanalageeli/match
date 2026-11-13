import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardCheck, RefreshCw } from 'lucide-react';
import { friendly } from './client';
import type { AdminApi, InterviewReviewSummary } from './types';

const topics:Record<string,string>={timeline:'التوقيت المفضّل',preparation:'الاستعداد العملي',nextStep:'الخطوة التالية',discussionPoints:'مواضيع للحوار'};
export function InterviewReview({id,api,onError}:{id:string;api:AdminApi;onError:(error:unknown)=>void}){
 const [value,setValue]=useState<InterviewReviewSummary|null>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function load(){
  if(busy)return;setBusy(true);setError('');setValue(undefined);
  try{const next=await api.interviewSummary(id);if(mounted.current)setValue(next);}
  catch(problem){if(mounted.current){setError(friendly(problem));onError(problem);}}
  finally{if(mounted.current)setBusy(false);}
 }
 return <details className="review-section" onToggle={event=>{if(event.currentTarget.open&&value===undefined&&!busy&&!error)void load();}}>
  <summary><ClipboardCheck size={17} aria-hidden="true" /> ملخص جلسة التوافق <ChevronDown size={16} aria-hidden="true" /></summary>
  <p className="muted">يظهر فقط الملخص الذي اختار العضو مشاركته. إفادات ذاتية قابلة للتعديل، وليست توثيقًا أو توصية آلية بالقبول. عدم المشاركة لا يؤثر في الأهلية.</p>
  {busy&&<p role="status">جارٍ تحميل الملخص…</p>}
  {error&&<p role="alert">{error}</p>}
  {value===null&&<p className="quiet-box">لا يوجد ملخص متاح للمشاركة حاليًا.</p>}
  {value&&<>
   <small className="muted">آخر تأكيد: {new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value.confirmedAt))}</small>
   <dl className="member-facts">{value.readiness.map(note=><div key={note.id}><dt>{topics[note.id]??'إفادة العضو'}</dt><dd dir="auto">{note.text}</dd></div>)}</dl>
   {!!value.clarifications.length&&<section><h4>نقاط يود العضو توضيحها</h4><ul>{value.clarifications.map(note=><li key={note.id} dir="auto">{note.text}</li>)}</ul></section>}
   <p className="muted">لا يُعرض نص الجلسة أو إجابات التفضيلات الخاصة. راجع مستندات التحقق بصورة مستقلة عند الحاجة.</p>
  </>}
  {!busy&&<button className="secondary" type="button" onClick={()=>void load()}><RefreshCw size={15} aria-hidden="true" /> تحديث الملخص</button>}
 </details>;
}
