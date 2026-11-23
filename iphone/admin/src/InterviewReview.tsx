import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardCheck, RefreshCw } from 'lucide-react';
import { friendly } from './client';
import type { AdminApi, InterviewReviewSummary, InterviewTranscript } from './types';

const topics:Record<string,string>={timeline:'التوقيت المفضّل',preparation:'الاستعداد العملي',nextStep:'الخطوة التالية',discussionPoints:'مواضيع للحوار'};
export function InterviewReview({id,api,onError}:{id:string;api:AdminApi;onError:(error:unknown)=>void}){
 const [value,setValue]=useState<InterviewReviewSummary|null>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [purpose,setPurpose]=useState(''),[transcript,setTranscript]=useState<InterviewTranscript|null>(),[opening,setOpening]=useState(false),[transcriptError,setTranscriptError]=useState('');
 const accessRevision = useRef(0);
 useEffect(()=>{
  if(!transcript)return;
  const hide=()=>{if(document.hidden)setTranscript(undefined);};
  const timer=window.setTimeout(()=>setTranscript(undefined),Math.min(120000,Math.max(0,Date.parse(transcript.expiresAt)-Date.now())));
  document.addEventListener('visibilitychange',hide);
  return()=>{window.clearTimeout(timer);document.removeEventListener('visibilitychange',hide);};
 },[transcript]);
 async function readTranscript(){
  if(opening || purpose.trim().length<10)return;
  const revision=++accessRevision.current;
  setOpening(true);setTranscriptError('');setTranscript(undefined);
  try {const text=await api.interviewTranscript(id,purpose.trim());if(mounted.current&&revision===accessRevision.current)setTranscript(text);}
  catch(cause){if(mounted.current&&revision===accessRevision.current)setTranscriptError(friendly(cause));}
  finally{if(mounted.current&&revision===accessRevision.current)setOpening(false);}
 }
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function load(){
  if(busy)return;setBusy(true);setError('');setValue(undefined);
  try{const next=await api.interviewSummary(id);if(mounted.current)setValue(next);}
  catch(problem){if(mounted.current){setError(friendly(problem));onError(problem);}}
  finally{if(mounted.current)setBusy(false);}
 }
 return <><details className="review-section" onToggle={event=>{if(event.currentTarget.open&&value===undefined&&!busy&&!error)void load();}}>
  <summary><ClipboardCheck size={17} aria-hidden="true" /> ملخص جلسة التوافق <ChevronDown size={16} aria-hidden="true" /></summary>
  <p className="muted">يظهر هنا ملخص الجلسات السابقة الذي اختار العضو مشاركته. إفادات ذاتية قابلة للتعديل، وليست توثيقًا أو توصية آلية بالقبول. عدم المشاركة لا يؤثر في الأهلية.</p>
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
 </details><details className="review-section" onToggle={event=>{if(!event.currentTarget.open){accessRevision.current++;setTranscript(undefined);setPurpose('');setTranscriptError('');setOpening(false);}}}>
   <summary><ClipboardCheck size={17} aria-hidden="true"/> حوار التسجيل مع لونا <ChevronDown size={16} aria-hidden="true"/></summary>
   <p>للمراجعة المرتبطة بطلب هذا العضو. يُسجّل سبب الاطلاع واسم المراجع.</p>
   <label>سبب الاطلاع<input value={purpose} maxLength={240} onChange={event=>setPurpose(event.target.value)} /></label>
   <button type="button" className="secondary" disabled={opening||purpose.trim().length<10} onClick={()=>void readTranscript()}>{opening?'جارٍ الفتح…':'فتح الحوار'}</button>
   {transcriptError&&<p role="alert">{transcriptError}</p>}
   {transcript===null&&<p role="status">لا يتوفر حوار مصرح بمراجعته.</p>}
   {transcript&&<><ol>{transcript.turns.map((turn,index)=><li key={index}><strong dir="auto">{turn.question}</strong><p dir="auto">{turn.skipped?'تجاوز العضو هذا السؤال.':turn.answer}</p></li>)}</ol>
   {transcript.help.length>0&&<section><h4>الحوار حول أسئلة التوافق</h4><ol>{transcript.help.map((exchange,i)=><li key={i}><strong dir="auto">{exchange.question}</strong><p dir="auto">{exchange.member}</p><p style={{whiteSpace:'pre-line'}} dir="auto">{exchange.reply}</p></li>)}</ol></section>}
   {transcript.currentQuestion&&<p dir="auto"><strong>آخر رسالة من لونا</strong> · {transcript.currentQuestion}</p>}</>}
 </details></>;
}
