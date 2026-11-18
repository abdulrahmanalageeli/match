import memberAr, { durationLabel } from '../member-copy.ts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Check, Feather, Users, X } from "../BrandIcons";
import type { CommunitySource, SeriousnessAgreement } from './data';
import './conversation-agreement.css';
import { HelpButton } from '../help/HelpCenter';
import { feedback } from '../feedback/haptics';
import { SuccessNotice } from './SuccessNotice';
export function ConversationAgreement({source,requestId,onAllowed,onEnd,onJourney,openDetails}:{source:CommunitySource;requestId:string;onAllowed:(allowed:boolean)=>void;onEnd?:()=>void;onJourney?:()=>void;openDetails?:boolean}){
 const [agreement,setAgreement]=useState<SeriousnessAgreement|null>(null),[days,setDays]=useState(14),[signed,setSigned]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);
 const [loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!source.agreement){onAllowed(true);return;}let active=true,fetching=false;const refresh=async()=>{if(fetching||document.hidden)return;fetching=true;try{const next=await source.agreement!(requestId);if(active){setAgreement(next);setLoadError(false);onAllowed(next.status==='accepted'||next.status==='family');}}catch{if(active){setLoadError(true);onAllowed(false);}}finally{fetching=false;}};void refresh();const stop=source.watch(()=>void refresh());const timer=setInterval(()=>void refresh(),15000);return()=>{active=false;stop();clearInterval(timer);};},[source,requestId,onAllowed,retry]);
 useEffect(()=>{if(openDetails)setExpanded(true);},[openDetails]);
 useEffect(()=>{setSigned(false);if(agreement?.days)setDays(agreement.days);},[agreement?.proposalId,agreement?.days]);
 async function submit(action:'propose'|'accept'|'family'|'extend'|'extension_accept'){
  if (!source.agree || busy) return;
  setBusy(true); setError('');
  try {
   const payload = action === 'extend' ? {days:7} : action === 'extension_accept' ? {proposalId:agreement?.extension?.id}
    : action === 'propose' ? {days,signed} : action === 'accept' ? {proposalId:agreement?.proposalId,signed} : {confirmed:true};
   const next = await source.agree(requestId, action, payload);
   setAgreement(next); onAllowed(next.status === 'accepted' || next.status === 'family');
   if (action === 'accept' && next.status === 'accepted') feedback('success');
  } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر حفظ الاتفاق.'); }
  finally { setBusy(false); }
 }
 if(!source.agreement)return null;
 if(loadError)return <div className="cm-agreement-loading"><p role="alert">تعذّر تحميل اتفاقكما. أعد المحاولة لاستئناف الحديث.</p><button className="btn-secondary" onClick={()=>{setLoadError(false);setRetry(n=>n+1);}}>إعادة تحميل الاتفاق</button></div>;
 if(!agreement)return <div className="cm-agreement-loading" role="status">جارٍ تحضير اتفاقكما…</div>;
 const remaining=agreement.deadline?Date.parse(agreement.deadline)-Date.now():null;
 const dueSoon=remaining!==null&&remaining>0&&remaining<=86400000;
 const allowed=agreement.status==='accepted'||agreement.status==='family',woman=agreement.actor==='reham';
 const date=agreement.deadline?new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'long',year:'numeric',calendar:'gregory',numberingSystem:'arab'}).format(new Date(agreement.deadline)):'';
 const mine=agreement.familyAgreed?.[agreement.actor];
 if(allowed&&!agreement.womanSignedAt&&!agreement.deadline)return null;
 if(allowed)return <div className="cm-agreement-summary">
  <button onClick={()=>setExpanded(true)} aria-label={agreement.status==='family'?'تفاصيل التواصل مع الأهل':`تفاصيل اتفاقكما حتى ${date}`} aria-haspopup="dialog"><CalendarDays size={15}/><span>{agreement.status==='family'?'التواصل مع الأهل':`${dueSoon?'موعدكما قريب · ':''}حتى ${date}`}</span></button>
  {expanded&&<AgreementDetails close={()=>setExpanded(false)}>
    <span className="cm-agreement-mark"><CalendarDays size={25}/></span>
    <h2>{memberAr.agreementTitle}</h2>
    <p className="cm-agreement-deadline">{agreement.status==='family'?'اتفقتما على التواصل مع الأهل':`مدة التعارف حتى ${date}`}</p>
    <SuccessNotice title={agreement.status==='family'?'اتفقتما على التواصل مع الأهل':'اتفقتما على مدة التعارف'} detail={agreement.status==='family'?'اتفقا على الشخص والوسيلة والموعد. تبقى تفاصيل التواصل قراركما.':'تبدأ المدة عند موافقتكما على الشروط والمدة المقترحة.'}/>
    <p>يمكن لأي منكما إنهاء التعارف. ويحتاج تمديد المدة أو التواصل مع الأهل إلى موافقتكما.</p>
    {agreement.status==='accepted'&&<button className="btn-primary" disabled={busy||mine} onClick={()=>void submit('family')}>{mine?'بانتظار موافقة الطرف الآخر':memberAr.agreeFamily}</button>}
    {agreement.status==='accepted'&&<div className="cm-extension-actions">
      <p>{dueSoon?'بقي أقل من يوم على موعدكما. اختارا ما يناسبكما بهدوء.':'يمكنكما مراجعة المدة والخطوة التالية معًا.'} لا تتغير مرحلة التعارف تلقائيًا.</p>
      {agreement.extension?<><p>{agreement.extension.actor===agreement.actor?'اقتراح التمديد بانتظار موافقة الطرف الآخر.':`يقترح الطرف الآخر تمديد المدة ${durationLabel(agreement.extension.days)}.`}</p>{agreement.extension.actor!==agreement.actor&&<button className="btn-secondary" disabled={busy} onClick={()=>void submit('extension_accept')}>الموافقة على التمديد</button>}</>:<button className="btn-secondary" disabled={busy} onClick={()=>void submit('extend')}>اقتراح أسبوع إضافي</button>}
      {onJourney&&<button className="btn-secondary" onClick={()=>{setExpanded(false);onJourney();}}>مراجعة الخطوة التالية</button>}
      {onEnd&&<button className="fb-text-button" onClick={()=>{setExpanded(false);onEnd();}}>{memberAr.endConnection}</button>}
    </div>}
    <small>هذا اتفاق بينكما، ولا يرسل وُدَين أي رسالة إلى العائلة.</small>{error&&<p role="alert">{error}</p>}
    <HelpButton topic="journey" label="ما الذي يحدث بعد ذلك؟"/>
  </AgreementDetails>}
 </div>;
 return <section className="cm-agreement" aria-labelledby="seriousness-title">
  <span className="cm-agreement-mark"><Feather size={27}/></span>
  <h2 id="seriousness-title">{agreement.status==='expired'?'انتهت مدة التعارف':memberAr.agreementTitle}</h2>
  <p className="cm-agreement-intro">{agreement.status==='expired'?`انتهت المدة المتفق عليها في ${date}. يمكنكما تمديدها أو الاتفاق على التواصل مع الأهل أو إنهاء التعارف.`:'قبل أول رسالة، اتفقا على شروط التعارف ومدته.'}</p>
  <HelpButton topic="journey" label="المدة ومسار التعارف، ببساطة"/>
  {agreement.status==='expired'?<><p>يمكنكما أيضًا تمديد المدة بموافقتكما معًا.</p>{agreement.extension ? agreement.extension.actor===agreement.actor ? <p>اقتراح التمديد بانتظار الطرف الآخر.</p> : <button className="btn-secondary" disabled={busy} onClick={()=>void submit('extension_accept')}>الموافقة على التمديد</button> : <button className="btn-secondary" disabled={busy} onClick={()=>void submit('extend')}>اقتراح أسبوع إضافي</button>}<div className="cm-agreement-family"><Users size={21}/><span>الانتقال للتواصل العائلي يحتاج موافقتكما معًا.</span></div><button className="btn-primary" disabled={busy||mine} onClick={()=>void submit('family')}>{mine?'بانتظار موافقة الطرف الآخر':memberAr.agreeFamily}</button><p className="cm-agreement-wait">يتوقف إرسال الرسائل حتى تتفقا على التمديد أو التواصل العائلي.</p>{onEnd&&<button className="btn-text" disabled={busy} onClick={onEnd}>{memberAr.endConnection}</button>}</>:<>
   <div className="cm-agreement-terms"><p><Check size={16}/> نيّتي تعارف جاد بهدف الزواج.</p><p><Check size={16}/> ألتزم بالاحترام والوضوح وحفظ الخصوصية.</p><p><Check size={16}/> يمكنني إنهاء التعارف في أي وقت. تمديد المدة أو التواصل مع الأهل يحتاج إلى موافقتنا معًا.</p></div>
   {woman?<><label className="cm-timeline-label">مدة التعارف</label><p className="cm-agreement-wait">تبدأ المدة عند موافقة الطرف الآخر على اقتراحك.</p><div className="cm-timeline-choices">{[7,14,30].map(n=><button key={n} aria-pressed={days===n} onClick={()=>{setDays(n);setSigned(false);}} disabled={busy}>{durationLabel(n)}</button>)}</div>{agreement.status==='proposed'&&<p className="cm-agreement-wait" role="status">المدة المقترحة: {durationLabel(agreement.days)}. بانتظار موافقة الطرف الآخر.</p>}</>:<div className="cm-timeline-offer"><CalendarDays size={23}/><strong>{agreement.status==='proposed'?`المدة المقترحة: ${durationLabel(agreement.days)}`:'بانتظار اقتراح الطرف الآخر.'}</strong>{agreement.status==='proposed'&&<p>تبدأ المدة عند موافقتك.</p>}</div>}
   {(woman||agreement.status==='proposed')&&<><label className="cm-agreement-sign"><input type="checkbox" checked={signed} onChange={e=>setSigned(e.target.checked)} disabled={busy}/><span>{memberAr.agreementConsent}</span></label><button className="btn-primary" disabled={!signed||busy} onClick={()=>void submit(woman?'propose':'accept')}>{busy?'جارٍ حفظ الموافقة…':woman?agreement.status==='proposed'?memberAr.updateDuration:memberAr.proposeDuration:memberAr.acceptDuration}</button></>}
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
