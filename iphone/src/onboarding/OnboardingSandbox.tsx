import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, LockKeyhole, Pencil, X } from 'lucide-react';
import { Brand } from '../Brand';
import { GuidedApplication, type ApplicationDraft } from './GuidedApplication';
import { LegalNotice } from '../legal/LegalNotice';
import { Welcome } from '../Welcome';
import { welcomeNavigation } from '../welcomeNavigation';
import './sandbox.css';

export function OnboardingSandbox({close, startAtForm=false, returnLabel='العودة لحسابي'}:{close:()=>void; startAtForm?:boolean; returnLabel?:string}) {
  const [stage,setStage]=useState<'intro'|'form'|'done'>(startAtForm?'form':'intro');
  const [legal,setLegal]=useState(false);
  const draft=useRef<ApplicationDraft|null>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  const legalDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if(legal && !legalDialog.current?.open) legalDialog.current?.showModal();
    else if(!legal) legalDialog.current?.close();
  },[legal]);
  useLayoutEffect(()=>{
    if(stage==='form') return;
    window.scrollTo(0,0);
    heading.current?.focus({preventScroll:true});
  },[stage]);
  function review() {
    welcomeNavigation(()=>setStage('form'),'back','.nf-onboarding-sandbox h1');
  }
  const start=()=>welcomeNavigation(()=>setStage('form'),'forward','.nf-onboarding-sandbox h1');

  return <section className="nf-onboarding-sandbox" dir="rtl" data-stage={stage}>
    {stage==='done' && <header className="nf-sandbox-bar">
      <button type="button" onClick={close}><ArrowRight size={19} aria-hidden="true"/><span>{returnLabel}</span></button>
      <Brand compact/>
    </header>}
    {stage==='intro' ? <Welcome onRegister={start} onLogin={close} onDemo={close} onDemoIntake={start} onPrivacy={()=>setLegal(true)}/>
    : <div hidden={stage==='done'}><GuidedApplication initial={null} previouslyApproved={false} busy={false}
      back={()=>welcomeNavigation(()=>setStage('intro'),'back','.nf-join')} exitPreview={close} onPrivacy={()=>setLegal(true)}
      save={()=>setStage('done')}
      draftRef={draft} draftOwner="onboarding-session" demo preview includeCompatibility/></div>}
    {stage==='done' && <main className="nf-sandbox-finish">
      <div className="nf-sandbox-finish-copy">
        <div className="nf-sandbox-check"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><polyline points="9,21 17,29 32,12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength="1"/></svg></div>
        <span className="nf-sandbox-eyebrow">خطوة أقرب لبدايتك</span>
        <h1 ref={heading} tabIndex={-1}>حكايتك أصبحت أوضح.<br/><span>والبداية تليق بك.</span></h1>
        <p>جمعت ما يعبّر عنك، وما يهمّك في شريك الحياة. يمكنك العودة لمراجعة أي تفصيل قبل الخطوة التالية.</p>
      </div>
      <div className="nf-sandbox-finish-actions">
        <p className="nf-sandbox-reassurance"><LockKeyhole size={16} aria-hidden="true"/><span>إجاباتك متاحة خلال هذه الجلسة. لم يُرسل طلب عضوية بعد؛ إنشاء الحساب وتأكيد الإرسال خطوتان منفصلتان.</span></p>
        <button type="button" className="nf-sandbox-primary" onClick={close}><span>{returnLabel}</span><ArrowRight size={19} aria-hidden="true"/></button>
        <button type="button" className="nf-sandbox-restart" onClick={review}><Pencil size={17} aria-hidden="true"/>مراجعة ملفي</button>
      </div>
    </main>}
    <dialog ref={legalDialog} className="nf-sandbox-legal" aria-label="شروط الاستخدام والخصوصية"
      onCancel={event=>{event.preventDefault();setLegal(false);}} onClose={()=>setLegal(false)}>
      <header><span>الخصوصية وشروط الاستخدام</span><button type="button" onClick={()=>setLegal(false)} aria-label="العودة إلى ملفك"><X size={21} aria-hidden="true"/></button></header>
      <LegalNotice preview/>
    </dialog>
  </section>;
}
