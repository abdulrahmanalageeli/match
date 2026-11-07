import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Check, Feather, Users, X } from 'lucide-react';
import type { CommunitySource, SeriousnessAgreement } from './data';
import './conversation-agreement.css';
import { HelpButton } from '../help/HelpCenter';
import { SuccessNotice } from './SuccessNotice';
export function ConversationAgreement({source,requestId,onAllowed}:{source:CommunitySource;requestId:string;onAllowed:(allowed:boolean)=>void}){
 const [agreement,setAgreement]=useState<SeriousnessAgreement|null>(null),[days,setDays]=useState(14),[signed,setSigned]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);
 const [loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!source.agreement){onAllowed(true);return;}let active=true,fetching=false;const refresh=async()=>{if(fetching)return;fetching=true;try{const next=await source.agreement!(requestId);if(active){setAgreement(next);setLoadError(false);onAllowed(next.status==='accepted'||next.status==='family');}}catch{if(active){setLoadError(true);onAllowed(false);}}finally{fetching=false;}};void refresh();const stop=source.watch(()=>void refresh());return()=>{active=false;stop();};},[source,requestId,onAllowed,retry]);
 useEffect(()=>setSigned(false),[agreement?.proposalId]);
 async function submit(action:'propose'|'accept'|'family'){
  if(!source.agree||busy)return;setBusy(true);setError('');try{const next=await source.agree(requestId,action,action==='propose'?{days,signed}:action==='accept'?{proposalId:agreement?.proposalId,signed}:{confirmed:true});setAgreement(next);onAllowed(next.status==='accepted'||next.status==='family');}catch(e){setError(e instanceof Error?e.message:'تعذّر حفظ الاتفاق.');}finally{setBusy(false);}
 }
 if(!source.agreement)return null;
 if(loadError)return <div className="cm-agreement-loading"><p role="alert">تعذّر تحميل اتفاقكما. أعد المحاولة لاستئناف الحديث.</p><button className="btn-secondary" onClick={()=>{setLoadError(false);setRetry(n=>n+1);}}>إعادة تحميل الاتفاق</button></div>;
 if(!agreement)return <div className="cm-agreement-loading" role="status">جارٍ تحضير اتفاقكما…</div>;
 const allowed=agreement.status==='accepted'||agreement.status==='family',woman=agreement.actor==='reham';
 const date=agreement.deadline?new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'long',calendar:'gregory'}).format(new Date(agreement.deadline)):'';
 const mine=agreement.familyAgreed?.[agreement.actor],peer=agreement.familyAgreed?.[woman?'abdulrahman':'reham'];
 if(allowed&&!agreement.womanSignedAt&&!agreement.deadline)return null;
 if(allowed)return <div className="cm-agreement-summary">
  <button onClick={()=>setExpanded(true)} aria-label={agreement.status==='family'?'تفاصيل الاتفاق العائلي':`تفاصيل اتفاقكما حتى ${date}`} aria-haspopup="dialog"><CalendarDays size={15}/><span>{agreement.status==='family'?'اتفاق عائلي':`حتى ${date}`}</span></button>
  {expanded&&<AgreementDetails close={()=>setExpanded(false)}>
    <span className="cm-agreement-mark"><CalendarDays size={25}/></span>
    <h2>اتفاقكما، بوضوح</h2>
    <p className="cm-agreement-deadline">{agreement.status==='family'?'اتفقتما على التواصل العائلي':`مدة التعارف حتى ${date}`}</p>
    <SuccessNotice title={agreement.status==='family'?'خطوتكما العائلية، باتفاقكما':'وقّعتما على بداية واضحة'} detail={agreement.status==='family'?'اتفقا على الشخص والوسيلة والموعد. تبقى تفاصيل التواصل قراركما.':'تبدأ المدة من القبول المتبادل. راجعا اتجاه الحديث قبل موعدها.'}/>
    <p>وقّعتما ميثاق الجدية. اتفقتما على الانتقال للتواصل العائلي أو إنهاء التعارف باحترام.</p>
    {agreement.status==='accepted'&&<button className="btn-primary" disabled={busy||mine} onClick={()=>void submit('family')}>{mine?'بانتظار موافقة الطرف الآخر':peer?'الموافقة على التواصل العائلي':'الانتقال للتواصل العائلي'}</button>}
    <small>هذا اتفاق بينكما، ولا يرسل نصفين أي رسالة إلى العائلة.</small>{error&&<p role="alert">{error}</p>}
    <HelpButton topic="journey" label="ما الذي يحدث بعد ذلك؟"/>
  </AgreementDetails>}
 </div>;
 return <section className="cm-agreement" aria-labelledby="seriousness-title">
  <span className="cm-agreement-mark"><Feather size={27}/></span><p className="cm-agreement-kicker">بداية واضحة، ونية جادّة</p>
  <h2 id="seriousness-title">{agreement.status==='expired'?'حان وقت الخطوة التالية':'ميثاق التعارف'}</h2>
  <p className="cm-agreement-intro">{agreement.status==='expired'?`انتهت المدة المتفق عليها في ${date}. اتفقا على التواصل العائلي أو أنهيا التعارف باحترام.`:'قبل أول رسالة، اتفقا على نية واضحة ووقت يحترمكما.'}</p>
  <HelpButton topic="journey" label="المدة ومسار التعارف، ببساطة"/>
  {agreement.status==='expired'?<><div className="cm-agreement-family"><Users size={21}/><span>الانتقال للتواصل العائلي يحتاج موافقتكما معًا.</span></div><button className="btn-primary" disabled={busy||mine} onClick={()=>void submit('family')}>{mine?'بانتظار موافقة الطرف الآخر':peer?'الموافقة على التواصل العائلي':'أوافق على التواصل العائلي'}</button><small>أو اختر «إنهاء التعارف» أعلى الصفحة.</small></>:<>
   <div className="cm-agreement-terms"><p><Check size={16}/> نيّتي تعارف جاد بهدف الزواج.</p><p><Check size={16}/> ألتزم بالاحترام والوضوح وحفظ الخصوصية.</p><p><Check size={16}/> بنهاية المدة، ننتقل للتواصل العائلي بموافقتنا أو ننهي التعارف بوضوح.</p></div>
   {woman?<><label className="cm-timeline-label">اختاري مدة التعارف</label><div className="cm-timeline-choices">{[7,14,30].map(n=><button key={n} aria-pressed={days===n} onClick={()=>{setDays(n);setSigned(false);}} disabled={busy}><b>{new Intl.NumberFormat('ar').format(n)}</b><span>يومًا</span></button>)}</div>{agreement.status==='proposed'&&<p className="cm-agreement-wait">اقترحتِ {agreement.days} يومًا. بانتظار توقيع عبدالرحمن وموافقته.</p>}</>:<div className="cm-timeline-offer"><CalendarDays size={23}/><strong>{agreement.status==='proposed'?`رهام تقترح ${agreement.days} يومًا`:'رهام تختار مدة التعارف'}</strong><p>{agreement.status==='proposed'?'تبدأ المدة عند موافقتك. التوقيع يعني قبول الميثاق والمدة معًا.':'تظهر المدة هنا بعد أن تختارها وتوقّع الميثاق.'}</p></div>}
   {(woman||agreement.status==='proposed')&&<><label className="cm-agreement-sign"><input type="checkbox" checked={signed} onChange={e=>setSigned(e.target.checked)} disabled={busy}/><span>أنا {woman?'رهام':'عبدالرحمن'}، قرأت ميثاق الجدية وأوافق عليه وعلى مدة التعارف المحددة.</span></label><button className="btn-primary" disabled={!signed||busy} onClick={()=>void submit(woman?'propose':'accept')}>{busy?'جارٍ حفظ التوقيع…':woman?agreement.status==='proposed'?'تحديث اقتراح المدة':'التوقيع واقتراح المدة':'التوقيع والموافقة وبدء الحديث'}</button></>}
   <div className="cm-agreement-signatures"><span className={agreement.womanSignedAt?'signed':''}>رهام {agreement.womanSignedAt?'· وقّعت':'· بانتظار التوقيع'}</span><span>عبدالرحمن · بانتظار التوقيع</span></div>
  </>}{error&&<p role="alert" className="form-error">{error}</p>}
 </section>;
}

function AgreementDetails({close,children}:{close:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} className="cm-sheet cm-agreement-dialog" dir="rtl" aria-label="تفاصيل اتفاق التعارف" onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
  <button className="icon-btn cm-agreement-close" aria-label="إغلاق تفاصيل الاتفاق" onClick={close}><X size={19}/></button>{children}
 </dialog>;
}
