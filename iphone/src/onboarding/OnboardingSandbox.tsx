import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, LockKeyhole, RefreshCw, Sparkles, UserRound, X } from 'lucide-react';
import { Brand } from '../Brand';
import { GuidedApplication, type ApplicationDraft } from './GuidedApplication';
import { LegalNotice } from '../legal/LegalNotice';
import { WelcomeHorizon } from '../WelcomeHorizon';
import './sandbox.css';

export function OnboardingSandbox({close}:{close:()=>void}) {
  const [stage,setStage]=useState<'intro'|'form'|'done'>('intro');
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

  return <section className="nf-onboarding-sandbox" dir="rtl" data-stage={stage}>
    {stage!=='form' && <header className="nf-sandbox-bar">
      <button type="button" onClick={close}><ArrowRight size={19} aria-hidden="true"/><span>العودة لحسابي</span></button>
      <Brand compact/>
    </header>}
    {stage==='intro' ? <main className="nf-sandbox-intro">
      <div className="nf-sandbox-intro-copy">
        <span className="nf-sandbox-eyebrow"><i aria-hidden="true"/>تجربة تسجيل جديد</span>
        <div className="nf-sandbox-cinematic" aria-hidden="true">
          <span className="nf-sandbox-ring nf-sandbox-ring-one"/>
          <span className="nf-sandbox-ring nf-sandbox-ring-two"/>
          <img className="nf-sandbox-emblem" src="/brand/nisfayn-emblem.png" alt="" width="96" height="104"/>
          <span className="nf-sandbox-glint"><Sparkles size={16}/></span>
        </div>
        <h1 ref={heading} tabIndex={-1}>ملفك ليس استمارة.<br/><span>إنه بداية تعارف حقيقي.</span></h1>
        <p>رحلة قصيرة وهادئة تساعدنا على فهمك، وحماية حدودك، وتقديمك للشخص المناسب بوضوح.</p>
      </div>
      <ol className="nf-sandbox-journey" aria-label="مراحل تجربة التسجيل">
        <li><span className="nf-sandbox-journey-icon"><UserRound size={21} aria-hidden="true"/></span><div><small>أولًا</small><strong>احكِ عن نفسك</strong><p>أساسياتك وحكايتك وما تختار مشاركته.</p></div><span className="nf-sandbox-journey-number" aria-hidden="true">١</span></li>
        <li><span className="nf-sandbox-journey-icon"><Sparkles size={21} aria-hidden="true"/></span><div><small>ثم</small><strong>حدّد ما ينسجم معك</strong><p>قيمك وشخصيتك ومواقف الحياة الحقيقية.</p></div><span className="nf-sandbox-journey-number" aria-hidden="true">٢</span></li>
        <li><span className="nf-sandbox-journey-icon"><CheckCheck size={21} aria-hidden="true"/></span><div><small>أخيرًا</small><strong>راجع صورتك أمام الآخرين</strong><p>اعرف ما سيظهر وعدّل كل شيء قبل الإرسال.</p></div><span className="nf-sandbox-journey-number" aria-hidden="true">٣</span></li>
      </ol>
      <div className="nf-sandbox-horizon"><WelcomeHorizon animate /></div>
      <footer className="nf-sandbox-intro-actions">
        <p className="nf-sandbox-reassurance"><LockKeyhole size={16} aria-hidden="true"/><span><strong>أنت المتحكم.</strong> هذه معاينة فقط؛ لن ننشئ حسابًا أو نرفع صورة أو نغيّر ملفك الحالي.</span></p>
        <button type="button" className="nf-sandbox-primary" onClick={()=>setStage('form')}><span><small>تستغرق دقائق قليلة</small><strong>ابدأ تجربة التسجيل</strong></span><ArrowLeft size={19} aria-hidden="true"/></button>
        <button type="button" className="nf-sandbox-legal-link" onClick={()=>setLegal(true)}>الخصوصية وشروط الاستخدام</button>
      </footer>
    </main> : stage==='form' ? <GuidedApplication key={attempt} initial={null} previouslyApproved={false} busy={false}
      back={()=>setStage('intro')} exitPreview={close} onPrivacy={()=>setLegal(true)}
      save={()=>{draft.current=null;setStage('done');}}
      draftRef={draft} draftOwner={'onboarding-preview-'+attempt} demo preview includeCompatibility/>
    : <main className="nf-sandbox-finish">
      <div className="nf-sandbox-finish-copy">
        <div className="nf-sandbox-check"><Check size={34} strokeWidth={1.7} aria-hidden="true"/></div>
        <span className="nf-sandbox-eyebrow">اكتملت تجربة التسجيل</span>
        <h1 ref={heading} tabIndex={-1}>هذه بداية حكايتك<br/><span>في نصفين.</span></h1>
        <p>مررت بتجربة العضو الجديد حتى مراجعة الملف. يمكنك العودة لحسابك أو بدء المعاينة من جديد.</p>
      </div>
      <div className="nf-sandbox-finish-actions">
        <p className="nf-sandbox-reassurance"><LockKeyhole size={16} aria-hidden="true"/><span>لم ننشئ حسابًا، ولم نرفع الصور أو نغيّر ملفك أو محادثاتك.</span></p>
        <button type="button" className="nf-sandbox-primary" onClick={close}><span>العودة لحسابي</span><ArrowRight size={19} aria-hidden="true"/></button>
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
