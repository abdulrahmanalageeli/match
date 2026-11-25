import memberAr, { durationLabel } from '../member-copy.ts';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CalendarHeart, Check, ChevronLeft, Clock3, Feather, HeartHandshake, LockKeyhole, ShieldCheck, Users, X } from "../BrandIcons";
import type { CommunitySource, SeriousnessAgreement } from './data';
import './conversation-agreement.css';
import { HelpButton } from '../help/HelpCenter';
import { SuccessNotice } from './SuccessNotice';
const deadlineFormat=new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'long',year:'numeric',numberingSystem:'arab',calendar:'gregory',hour:'numeric',minute:'2-digit'});
const shortDeadlineFormat=new Intl.DateTimeFormat('ar-SA',{day:'numeric',month:'long',numberingSystem:'arab',calendar:'gregory'});
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
   ? decisions || 'حان وقت القرار معًا: الخطوة التالية في مسار التعارف أو إنهاء التعارف باحترام.'
   : proposed ? `المدة المقترحة: ${durationLabel(agreement.days)}.`
   : woman?'اختاري المدة ووقّعي الميثاق ليراجعه الطرف الآخر.':`سيظهر الميثاق هنا بعد أن تحدد ${peerName} مدة التعارف وتوقّع عليه.`;
 function decisionNotice(heading:string,body:string,action:string){
   const notice=<aside className="cm-agreement-notice" aria-label="حالة ميثاق التعارف">
     <span className="cm-agreement-seal" aria-hidden="true">{expired?<CalendarDays size={22}/>:<Feather size={22}/>}</span>
     <div className="cm-agreement-notice-copy" role="status"><h3>{heading}</h3><p>{body}</p></div>
     <button type="button" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>{expanded?'إخفاء التفاصيل':action}<ChevronLeft size={15} aria-hidden="true"/></button>
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
  {agreement.status==='accepted' && decisions ? decisionNotice('خطوتكما التالية',decisions,'مراجعة الطلب') : <button onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded} data-due-soon={dueSoon || undefined} aria-label={agreement.status==='family'?'تفاصيل التواصل مع الأهل':`تفاصيل اتفاقكما حتى ${date}`}><CalendarDays size={15}/><span>{agreement.status==='family'?'التواصل مع الأهل':agreement.deadline ? `${dueSoon?'موعدكما':'حتى'} ${shortDeadlineFormat.format(new Date(agreement.deadline))}` : 'تفاصيل الاتفاق'}</span></button>}
  {expanded&&<AgreementDetails host={noticeSlot} close={()=>setExpanded(false)}>
    <span className="cm-agreement-mark"><CalendarDays size={25}/></span>
    <h2>{memberAr.agreementTitle}</h2>
    <p className="cm-agreement-deadline">{agreement.status==='family'?'اتفقتما على التواصل العائلي':`مدة التعارف حتى ${date}`}</p>
    <SuccessNotice title={agreement.status==='family'?'خطوتكما العائلية، باتفاقكما':'وقّعتما على بداية واضحة'} detail={agreement.status==='family'?'اتفقا على الشخص والوسيلة والموعد. تبقى تفاصيل التواصل قراركما.':'تبدأ المدة من القبول المتبادل. راجعا اتجاه الحديث قبل موعدها.'}/>
    <p>عند انتهاء المدة، تقرّران معًا الانتقال إلى الخطوة التالية في مسار التعارف أو إنهاء التعارف باحترام.</p>
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
 const form = <section className="cm-agreement" data-agreement-status={agreement.status} aria-labelledby="seriousness-title">
  <header className="cm-agreement-hero">
   <span className="cm-agreement-mark">{expired?<CalendarDays size={22}/>:<Feather size={22}/>}</span>
   <h2 id="seriousness-title">{title}</h2>
   <p className="cm-agreement-intro">{expired ? date && `انتهت المدة في ${date}.` : description}</p>
  </header>
  <p className="cm-agreement-purpose">مدة للتعارف بوضوح. في نهايتها، تقرّران معًا الانتقال إلى الخطوة التالية في <strong>مسار التعارف</strong> أو إنهاء التعارف باحترام.</p>
  <HelpButton topic="journey" label="عن الميثاق ومسار التعارف"/>
  {expired ? <div className="cm-agreement-decisions">
   {onJourney && <button className="btn-primary" onClick={()=>{setExpanded(false);onJourney();}}>مراجعة الخطوة التالية في المسار</button>}
   {onEnd && <button className="btn-secondary" disabled={busy} onClick={()=>{setExpanded(false);onEnd();}}>إنهاء التعارف باحترام</button>}
   <details>
    <summary>خيارات التمديد والتواصل العائلي</summary>
    <p>يمكنكما تمديد المدة بموافقتكما معًا.</p>
    {agreement.extension ? agreement.extension.actor===agreement.actor
     ? <p>اقتراح التمديد بانتظار الطرف الآخر.</p>
     : <button className="btn-secondary" disabled={busy} onClick={()=>void submit('extension_accept')}>الموافقة على تمديد المدة {durationLabel(agreement.extension.days)}</button>
     : <button className="btn-secondary" disabled={busy} onClick={()=>void submit('extend')}>اقتراح أسبوع إضافي</button>}
    <div className="cm-agreement-family"><Users size={21}/><span>الانتقال للتواصل العائلي يحتاج موافقتكما معًا.</span></div>
    {familyActions}
   </details>
   <p className="cm-agreement-wait">تُستأنف المراسلة بعد اتفاقكما على التمديد أو التواصل العائلي.</p>
  </div> : <>
   <div className="cm-agreement-terms" aria-label="أسس ميثاق التعارف">
    <p><span className="cm-agreement-term-mark"><HeartHandshake size={17}/></span><span><strong>تعارف جاد بهدف الزواج</strong></span></p>
    <p><span className="cm-agreement-term-mark"><ShieldCheck size={17}/></span><span><strong>الاحترام والوضوح وحفظ الخصوصية</strong></span></p>
   </div>
   {woman?<><div className="cm-timeline-heading"><span><CalendarDays size={16}/> مدة التعارف</span><small>تبدأ بعد توقيعكما</small></div><div className="cm-timeline-choices">{[7,14,30].map(n=><button key={n} aria-pressed={days===n} onClick={()=>{setDays(n);setSigned(false);}} disabled={busy}><b>{daysFormat.format(n)}</b><span>{n===7?'أيام':'يومًا'}</span></button>)}</div></>:<div className="cm-timeline-offer"><span><CalendarHeart size={22}/></span><strong>{proposed?`${peerName} تقترح ${durationLabel(agreement.days)}`:`${peerName} تختار مدة التعارف`}</strong><p>{proposed?'تبدأ المدة عند موافقتك. التوقيع يعني قبول الميثاق والمدة معًا.':'تظهر المدة هنا بعد أن تختارها وتوقّع الميثاق.'}</p></div>}
   {(woman||agreement.status==='proposed')&&<><label className="cm-agreement-sign"><input type="checkbox" checked={signed} onChange={e=>setSigned(e.target.checked)} disabled={busy}/><span>{myName ? `أنا ${myName}، ` : ''}قرأت شروط الميثاق وأوافق عليها وعلى مدة التعارف المحددة.</span></label><button className="btn-primary cm-agreement-submit" disabled={!signed||busy} onClick={()=>void submit(woman?'propose':'accept')}>{busy?'جارٍ حفظ التوقيع…':woman?agreement.status==='proposed'?'تحديث اقتراح المدة':'التوقيع واقتراح المدة':'التوقيع والموافقة وبدء الحديث'}</button></>}
   <footer className="cm-agreement-signoff">
    <div className="cm-agreement-signatures" role="group" aria-label="حالة التوقيع">
     <span className={agreement.womanSignedAt?'signed':''}><i aria-hidden="true">{agreement.womanSignedAt?<Check size={14}/>:<Clock3 size={14}/>}</i><span><b>{womanName}</b><small>{agreement.womanSignedAt?'تم التوقيع':'بانتظار التوقيع'}</small></span></span>
     <span><i aria-hidden="true"><Clock3 size={14}/></i><span><b>{manName}</b><small>بانتظار التوقيع</small></span></span>
    </div>
    <p className="cm-agreement-chat-status" role="status">
     <LockKeyhole size={15}/>
     <span>{proposed && woman ? `بانتظار توقيع ${peerName} لبدء المحادثة` : 'تُفتح المحادثة بعد توقيع الطرفين'}</span>
    </p>
   </footer>
  </>}{error&&<p role="alert" className="form-error">{error}</p>}
 </section>;
 if (!hasHistory && !(proposed && woman)) return noticeSlot?createPortal(form,noticeSlot):form;
 return <>
  {!expanded && decisionNotice(title,proposed ? `${description} في نهايتها تقرّران الخطوة التالية في مسار التعارف أو إنهاء التعارف.` : description,expired?'اختيار الخطوة التالية':proposed && woman?'مراجعة اقتراحك':'مراجعة الميثاق')}
  {expanded && <AgreementDetails host={noticeSlot} close={()=>setExpanded(false)}>{form}</AgreementDetails>}
 </>;
}

function AgreementDetails({close,children,host}:{close:()=>void;children:ReactNode;host?:HTMLElement|null}) {
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{ref.current?.focus({preventScroll:true});ref.current?.scrollIntoView({block:'nearest'});},[]);
 const details=<section ref={ref} tabIndex={-1} className="cm-agreement-inline" dir="rtl" aria-label="تفاصيل اتفاق التعارف">
  <button className="icon-btn cm-agreement-close" aria-label="إغلاق تفاصيل الاتفاق" onClick={close}><X size={19}/></button>{children}
 </section>;
 return host?createPortal(details,host):details;
}
