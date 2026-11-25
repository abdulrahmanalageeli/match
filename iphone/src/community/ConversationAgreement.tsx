import memberAr, { durationLabel } from '../member-copy.ts';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronLeft, Feather, Users, X } from "../BrandIcons";
import type { CommunitySource, SeriousnessAgreement } from './data';
import './conversation-agreement.css';
import { HelpButton } from '../help/HelpCenter';
import { SuccessNotice } from './SuccessNotice';
const deadlineFormat=new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'long',year:'numeric',numberingSystem:'arab',calendar:'gregory',hour:'numeric',minute:'2-digit'});
const daysFormat=new Intl.NumberFormat('ar-SA',{numberingSystem:'arab'});

export function ConversationAgreement({source,requestId,onAllowed,onEnd,onJourney,openDetails,hasHistory,noticeSlot,peerAlias}:{source:CommunitySource;requestId:string;onAllowed:(allowed:boolean)=>void;onEnd?:()=>void;onJourney?:()=>void;openDetails?:boolean;hasHistory?:boolean;noticeSlot?:HTMLElement|null;peerAlias?:string}){
 const [agreement,setAgreement]=useState<SeriousnessAgreement|null>(null),[days,setDays]=useState(14),[signed,setSigned]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false);
 const [loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0);
 const revision=useRef(0),saving=useRef(false);
 const applyAgreement=useCallback((next:SeriousnessAgreement)=>{
   const expired=next.status==='accepted' && next.deadline && Date.parse(next.deadline)<=Date.now();
   const current=expired?{...next,status:'expired' as const}:next;
   setAgreement(current);
   setLoadError(false);
   onAllowed(current.status==='accepted'||current.status==='family');
 },[onAllowed]);
 useEffect(()=>{
   const read=source.agreement;
   if(!read){onAllowed(true);return;}
   let active=true,fetching=false;
   let readTimeout:ReturnType<typeof setTimeout>;
   const refresh=async(initial=false)=>{
     if(fetching||saving.current||(!initial&&document.hidden))return;
     const version=revision.current;
     fetching=true;
     const unavailable=()=>{
       if(active && version===revision.current){setLoadError(true);onAllowed(false);}
     };
     // The session lookup can stall before the RPC's network timeout starts.
     readTimeout=setTimeout(unavailable,15_000);
     try{
       const next=await read(requestId);
       if(active && version===revision.current)applyAgreement(next);
     }catch{
       unavailable();
     }finally{clearTimeout(readTimeout);fetching=false;}
   };
   // A chat opened during iOS resume can mount before its first visible event.
   void refresh(true);
   const refreshVisible=()=>{void refresh();};
   const stop=source.watch(refreshVisible),timer=setInterval(refreshVisible,15000);
   document.addEventListener('visibilitychange',refreshVisible);
   window.addEventListener('online',refreshVisible);
   return ()=>{
     active=false;revision.current++;
     stop();clearTimeout(readTimeout);clearInterval(timer);
     document.removeEventListener('visibilitychange',refreshVisible);
     window.removeEventListener('online',refreshVisible);
   };
 },[source,requestId,onAllowed,applyAgreement,retry]);
 useEffect(()=>{if(openDetails)setExpanded(true);},[openDetails]);
 useEffect(()=>{setSigned(false);if(agreement?.days)setDays(agreement.days);},[agreement?.proposalId,agreement?.days]);
 useEffect(()=>{
   if(agreement?.status!=='accepted'||!agreement.deadline)return;
   const deadline=Date.parse(agreement.deadline);
   let timer:ReturnType<typeof setTimeout>;
   function check(){
     clearTimeout(timer);
     const left=deadline-Date.now();
     if(left>0){timer=setTimeout(check,Math.min(left,2147483647));return;}
     setAgreement(current=>current?.status==='accepted'&&current.deadline===agreement?.deadline?{...current,status:'expired'}:current);
     onAllowed(false);
   }
   check();document.addEventListener('visibilitychange',check);
   return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',check);};
 },[agreement?.deadline,agreement?.status,onAllowed]);
 async function submit(action:'propose'|'accept'|'family_propose'|'family_accept'|'family_clear'|'extend'|'extension_accept'){
  if(!source.agree||saving.current)return;
  saving.current=true;
  const version=++revision.current;
  setBusy(true);setError('');
  try{
    const payload=action==='extend'?{days:7}:action==='extension_accept'?{proposalId:agreement?.extension?.id}:action==='propose'?{days,signed}:action==='accept'?{proposalId:agreement?.proposalId,signed}:{confirmed:true,proposalId:agreement?.familyProposalId};
    const next=await source.agree(requestId,action,payload);
    if(version===revision.current)applyAgreement(next);
  }catch(e){
    if(version===revision.current)setError(e instanceof Error?e.message:'تعذّر حفظ الاتفاق.');
  }finally{saving.current=false;setBusy(false);}

 }
 if(!source.agreement)return null;
 if(loadError)return <div className="cm-agreement-loading"><p role="alert">تعذّر تحميل اتفاقكما. أعد المحاولة لاستئناف الحديث.</p><button className="btn-secondary" onClick={()=>{setLoadError(false);setRetry(n=>n+1);}}>إعادة تحميل الاتفاق</button></div>;
 if(!agreement)return <div className="cm-agreement-loading" role="status">جارٍ تحضير اتفاقكما…</div>;
 const remaining=agreement.deadline?Date.parse(agreement.deadline)-Date.now():null;
 const dueSoon=remaining!==null&&remaining>0&&remaining<=86400000;
 const allowed=agreement.status==='accepted'||agreement.status==='family',woman=agreement.actor==='reham';
 const myName=agreement.mineName,peerName=agreement.peerName||peerAlias||(woman?'شريكك':'شريكتك');
 const womanName=woman?(myName||'أنتِ'):peerName,manName=woman?peerName:(myName||'أنت');
 const date=agreement.deadline?deadlineFormat.format(new Date(agreement.deadline)):'';
 const mine=agreement.familyAgreed?.[agreement.actor],peer=agreement.familyAgreed?.[woman?'abdulrahman':'reham'];
 const expired=agreement.status==='expired';
 const proposed=agreement.status==='proposed';
 const title=expired?'انتهت مدة ميثاق التعارف':proposed
   ? woman?'أرسلتِ ميثاق التعارف':`أرسلت ${peerName} ميثاق التعارف`
   : woman?'اختاري مدة التعارف':'بانتظار ميثاق التعارف';
 const decisions=[
   agreement.extension && (agreement.extension.actor===agreement.actor
     ? 'أرسلت اقتراح التمديد، وبانتظار رد الطرف الآخر.'
     : `وصلك اقتراح لتمديد المدة ${durationLabel(agreement.extension.days)}.`),
   mine && !peer && 'أرسلت طلب التواصل العائلي، وبانتظار الرد.',
   peer && !mine && 'وصلك طلب للتواصل العائلي.',
 ].filter(Boolean).join(' ');
 const description=expired
   ? decisions || 'توقفت المراسلة. تقدرون تمدّدون المدة، تنتقلون للتواصل العائلي، أو تنهون التعارف.'
   : proposed ? `${durationLabel(agreement.days)} تبدأ بعد ${woman?`توقيع ${peerName}`:'توقيعك على الميثاق'}.`
   : woman?'اختاري المدة ووقّعي الميثاق ليراجعه الطرف الآخر.':`بعد ما تختار ${peerName} المدة وترسل الميثاق، يوصلك هنا للتوقيع.`;
 function decisionNotice(heading:string,body:string,action:string){
   const notice=<aside className="cm-agreement-notice" aria-label="حالة ميثاق التعارف">
     <span className="cm-agreement-seal" aria-hidden="true">{expired?<CalendarDays size={22}/>:<Feather size={22}/>}</span>
     <div className="cm-agreement-notice-copy" role="status"><h3>{heading}</h3><p>{body}</p></div>
     <button type="button" onClick={()=>setExpanded(true)} aria-haspopup="dialog">{action}<ChevronLeft size={15} aria-hidden="true"/></button>
   </aside>;
   return noticeSlot?createPortal(notice,noticeSlot):notice;
 }
 const familyActions=<>
   {!mine && agreement.status!=='family' && <button className="btn-primary" disabled={busy} onClick={()=>void submit(peer?'family_accept':'family_propose')}>{peer?'الموافقة على التواصل العائلي':'اقتراح التواصل العائلي'}</button>}
   {(mine||peer||agreement.status==='family') && <button className="btn-secondary" disabled={busy} onClick={()=>void submit('family_clear')}>{mine||agreement.status==='family'?'سحب موافقتي على التواصل العائلي':'رفض طلب التواصل العائلي'}</button>}
   {mine && !peer && <p>بانتظار قرار الطرف الآخر.</p>}
 </>;
 if(allowed&&!agreement.womanSignedAt&&!agreement.deadline)return null;
 if(allowed)return <div className="cm-agreement-summary">
  {agreement.status==='accepted' && decisions ? decisionNotice('خطوتكما التالية',decisions,'مراجعة الطلب') : <button onClick={()=>setExpanded(true)} aria-label={agreement.status==='family'?'تفاصيل التواصل مع الأهل':`تفاصيل اتفاقكما حتى ${date}`} aria-haspopup="dialog"><CalendarDays size={15}/><span>{agreement.status==='family'?'التواصل مع الأهل':`${dueSoon?'موعدكما قريب · ':''}حتى ${date}`}</span></button>}
  {expanded&&<AgreementDetails close={()=>setExpanded(false)}>
    <span className="cm-agreement-mark"><CalendarDays size={25}/></span>
    <h2>{memberAr.agreementTitle}</h2>
    <p className="cm-agreement-deadline">{agreement.status==='family'?'اتفقتما على التواصل العائلي':`مدة التعارف حتى ${date}`}</p>
    <SuccessNotice title={agreement.status==='family'?'خطوتكما العائلية، باتفاقكما':'وقّعتما على بداية واضحة'} detail={agreement.status==='family'?'اتفقا على الشخص والوسيلة والموعد. تبقى تفاصيل التواصل قراركما.':'تبدأ المدة من القبول المتبادل. راجعا اتجاه الحديث قبل موعدها.'}/>
    <p>وقّعتما شروط التعارف. اتفقتما على الانتقال للتواصل العائلي أو إنهاء التعارف باحترام.</p>
    {familyActions}
    {agreement.status==='accepted'&&<div className="cm-extension-actions">
      <p>{dueSoon?'بقي أقل من يوم على موعدكما. اختارا ما يناسبكما بهدوء.':'يمكنكما مراجعة المدة والخطوة التالية معًا.'} لا تتغير مرحلة التعارف تلقائيًا.</p>
      {agreement.extension?<><p>{agreement.extension.actor===agreement.actor?'اقتراح التمديد بانتظار موافقة الطرف الآخر.':`يقترح الطرف الآخر تمديد المدة ${durationLabel(agreement.extension.days)}.`}</p>{agreement.extension.actor!==agreement.actor&&<button className="btn-secondary" disabled={busy} onClick={()=>void submit('extension_accept')}>الموافقة على التمديد</button>}</>:<button className="btn-secondary" disabled={busy} onClick={()=>void submit('extend')}>اقتراح أسبوع إضافي</button>}
      {onJourney&&<button className="btn-secondary" onClick={()=>{setExpanded(false);onJourney();}}>مراجعة الخطوة التالية</button>}
      {onEnd&&<button className="fb-text-button" onClick={()=>{setExpanded(false);onEnd();}}>{memberAr.endConnection}</button>}
    </div>}
    <small>هذا الاتفاق يخص محادثتكما. لإيقاف وصول الأهل إلى غرفة قائمة، اسحب الموافقة من جسر الأهل.</small>{error&&<p role="alert">{error}</p>}
    <HelpButton topic="journey" label="ما الذي يحدث بعد ذلك؟"/>
  </AgreementDetails>}
 </div>;
 const form = <section className="cm-agreement" aria-labelledby="seriousness-title">
  <span className="cm-agreement-mark">{expired?<CalendarDays size={27}/>:<Feather size={27}/>}</span>
  <h2 id="seriousness-title">{title}</h2>
  <p className="cm-agreement-intro">{expired && date ? `انتهت المدة في ${date}. ` : ''}{description}</p>
  <HelpButton topic="journey" label="المدة ومسار التعارف، ببساطة"/>
  {agreement.status==='expired'?<><p>يمكنكما أيضًا تمديد المدة بموافقتكما معًا.</p>{agreement.extension ? agreement.extension.actor===agreement.actor ? <p>اقتراح التمديد بانتظار الطرف الآخر.</p> : <button className="btn-secondary" disabled={busy} onClick={()=>void submit('extension_accept')}>الموافقة على تمديد المدة {durationLabel(agreement.extension.days)}</button> : <button className="btn-secondary" disabled={busy} onClick={()=>void submit('extend')}>اقتراح أسبوع إضافي</button>}<div className="cm-agreement-family"><Users size={21}/><span>الانتقال للتواصل العائلي يحتاج موافقتكما معًا.</span></div>{familyActions}<p className="cm-agreement-wait">يتوقف إرسال الرسائل حتى تتفقا على التمديد أو التواصل العائلي.</p>{onEnd&&<button className="btn-text" disabled={busy} onClick={()=>{setExpanded(false);onEnd();}}>إنهاء التعارف باحترام</button>}</>:<>
   <div className="cm-agreement-terms"><p><Check size={16}/> نيّتي تعارف جاد بهدف الزواج.</p><p><Check size={16}/> ألتزم بالاحترام والوضوح وحفظ الخصوصية.</p><p><Check size={16}/> بنهاية المدة، ننتقل للتواصل العائلي بموافقتنا أو ننهي التعارف بوضوح.</p></div>
   {woman?<><label className="cm-timeline-label">اختاري مدة التعارف</label><p className="cm-agreement-wait">تبدأ المدة بعد توقيع الطرف الآخر، وليس عند إرسال اقتراحك.</p><div className="cm-timeline-choices">{[7,14,30].map(n=><button key={n} aria-pressed={days===n} onClick={()=>{setDays(n);setSigned(false);}} disabled={busy}><b>{daysFormat.format(n)}</b><span>يومًا</span></button>)}</div>{agreement.status==='proposed'&&<p className="cm-agreement-wait" role="status">اقترحتِ {durationLabel(agreement.days)}. بانتظار توقيع {peerName} وموافقته.</p>}</>:<div className="cm-timeline-offer"><CalendarDays size={23}/><strong>{agreement.status==='proposed'?`${peerName} تقترح ${durationLabel(agreement.days)}`:`${peerName} تختار مدة التعارف`}</strong><p>{agreement.status==='proposed'?'تبدأ المدة عند موافقتك. التوقيع يعني قبول الميثاق والمدة معًا.':'تظهر المدة هنا بعد أن تختارها وتوقّع الميثاق.'}</p></div>}
   {(woman||agreement.status==='proposed')&&<><label className="cm-agreement-sign"><input type="checkbox" checked={signed} onChange={e=>setSigned(e.target.checked)} disabled={busy}/><span>{myName ? `أنا ${myName}، ` : ''}قرأت شروط الميثاق وأوافق عليها وعلى مدة التعارف المحددة.</span></label><button className="btn-primary" disabled={!signed||busy} onClick={()=>void submit(woman?'propose':'accept')}>{busy?'جارٍ حفظ التوقيع…':woman?agreement.status==='proposed'?'تحديث اقتراح المدة':'التوقيع واقتراح المدة':'التوقيع والموافقة وبدء الحديث'}</button></>}
   <div className="cm-agreement-signatures"><span className={agreement.womanSignedAt?'signed':''}>{womanName} {agreement.womanSignedAt?'· وقّعت':'· بانتظار التوقيع'}</span><span>{manName} · بانتظار التوقيع</span></div>
  </>}{error&&<p role="alert" className="form-error">{error}</p>}
 </section>;
 if (!hasHistory) return form;
 return <>
  {decisionNotice(title,description,expired?'اختيار الخطوة التالية':proposed && woman?'مراجعة اقتراحك':'مراجعة الميثاق')}
  {expanded && <AgreementDetails close={()=>setExpanded(false)}>{form}</AgreementDetails>}
 </>;
}

function AgreementDetails({close,children}:{close:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} className="cm-sheet cm-agreement-dialog" dir="rtl" aria-label="تفاصيل اتفاق التعارف" onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
  <button className="icon-btn cm-agreement-close" aria-label="إغلاق تفاصيل الاتفاق" onClick={close}><X size={19}/></button>{children}
 </dialog>;
}
