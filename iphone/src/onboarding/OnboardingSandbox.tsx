import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, LockKeyhole, RefreshCw, X } from 'lucide-react';
import { Brand } from '../Brand';
import { GuidedApplication, type ApplicationDraft } from './GuidedApplication';
import { LegalNotice } from '../legal/LegalNotice';
import { Welcome } from '../Welcome';
import { welcomeNavigation } from '../welcomeNavigation';
import './sandbox.css';

export function OnboardingSandbox({close, startAtForm=false, returnLabel='العودة لحسابي'}:{close:()=>void; startAtForm?:boolean; returnLabel?:string}) {
  const [stage,setStage]=useState<'intro'|'form'|'done'>(startAtForm?'form':'intro');
  const [legal,setLegal]=useState(false),[attempt,setAttempt]=useState(0);
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
  function restart() {
    draft.current=null;
    setAttempt(n=>n+1);
    setStage('intro');
  }
  const start=()=>welcomeNavigation(()=>setStage('form'),'forward','.nf-onboarding-sandbox h1');

  return <section className="nf-onboarding-sandbox" dir="rtl" data-stage={stage}>
    {stage==='done' && <header className="nf-sandbox-bar">
      <button type="button" onClick={close}><ArrowRight size={19} aria-hidden="true"/><span>{returnLabel}</span></button>
      <Brand compact/>
    </header>}
    {stage==='intro' ? <Welcome onRegister={start} onLogin={close} onDemo={close} onDemoIntake={start} onPrivacy={()=>setLegal(true)}/>
    : stage==='form' ? <GuidedApplication key={attempt} initial={null} previouslyApproved={false} busy={false}
      back={()=>welcomeNavigation(()=>setStage('intro'),'back','.nf-join')} exitPreview={close} onPrivacy={()=>setLegal(true)}
      save={()=>{draft.current=null;setStage('done');}}
      draftRef={draft} draftOwner={'onboarding-preview-'+attempt} demo preview includeCompatibility/>
    : <main className="nf-sandbox-finish">
      <div className="nf-sandbox-finish-copy">
        <div className="nf-sandbox-check"><Check size={34} strokeWidth={1.7} aria-hidden="true"/></div>
        <span className="nf-sandbox-eyebrow">اكتملت تجربة التسجيل</span>
        <h1 ref={heading} tabIndex={-1}>هذه بداية حكايتك<br/><span>في نصفين.</span></h1>
        <p>مررت بتجربة العضو الجديد حتى مراجعة الملف. يمكنك العودة أو بدء المعاينة من جديد.</p>
      </div>
      <div className="nf-sandbox-finish-actions">
        <p className="nf-sandbox-reassurance"><LockKeyhole size={16} aria-hidden="true"/><span>لم ننشئ حسابًا، ولم نرفع الصور أو نغيّر ملفك أو محادثاتك.</span></p>
        <button type="button" className="nf-sandbox-primary" onClick={close}><span>{returnLabel}</span><ArrowRight size={19} aria-hidden="true"/></button>
        <button type="button" className="nf-sandbox-restart" onClick={restart}><RefreshCw size={17} aria-hidden="true"/>تجربة البداية مجددًا</button>
      </div>
    </main>}
    <dialog ref={legalDialog} className="nf-sandbox-legal" aria-label="شروط الاستخدام والخصوصية في المعاينة"
      onCancel={event=>{event.preventDefault();setLegal(false);}} onClose={()=>setLegal(false)}>
      <header><span>الخصوصية وشروط الاستخدام</span><button type="button" onClick={()=>setLegal(false)} aria-label="العودة للتجربة"><X size={21} aria-hidden="true"/></button></header>
      <LegalNotice preview/>
    </dialog>
  </section>;
}
