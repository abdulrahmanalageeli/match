import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, RefreshCw, ShieldCheck } from 'lucide-react';
import { Welcome } from '../Screens';
import { GuidedApplication, type ApplicationDraft } from './GuidedApplication';
import { LegalNotice } from '../legal/LegalNotice';
import './sandbox.css';

export function OnboardingSandbox({close}:{close:()=>void}){
 const [stage,setStage]=useState<'intro'|'form'|'done'>('intro'),[legal,setLegal]=useState(false),[attempt,setAttempt]=useState(0);
 const draft=useRef<ApplicationDraft|null>(null);
 const legalDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(legal)legalDialog.current?.showModal();else legalDialog.current?.close();},[legal]);
 function restart(){draft.current=null;setAttempt(n=>n+1);setStage('intro');window.scrollTo(0,0);}
 return <section className="nf-onboarding-sandbox" dir="rtl">
   <header className="nf-sandbox-bar"><button type="button" onClick={close}><ArrowRight size={16}/> العودة لحسابي</button><span><ShieldCheck size={14}/> معاينة تسجيل جديد</span></header>
   {stage==='intro'?<Welcome replayIntro onRegister={()=>setStage('form')} onLogin={()=>setStage('form')} onDemo={()=>setStage('form')} onDemoIntake={()=>setStage('form')} onPrivacy={()=>setLegal(true)}/>:stage==='form'?<GuidedApplication key={attempt} initial={null} previouslyApproved={false} busy={false} back={()=>setStage('intro')} onPrivacy={()=>setLegal(true)} save={()=>{draft.current=null;setStage('done');window.scrollTo(0,0);}} draftRef={draft} draftOwner={'onboarding-preview-'+attempt} demo preview includeCompatibility/>:<main className="app-screen nf-sandbox-finish"><div className="nf-sandbox-check"><Check size={32}/></div><span className="eyebrow">وصلت إلى نهاية الرحلة</span><h1>هكذا تبدأ حكاية العضو.</h1><p>اكتملت المعاينة. لم ننشئ حسابًا، ولم نرفع الصور أو نغيّر ملفك أو محادثاتك.</p><button className="btn-primary" onClick={close}>العودة لحسابي <ArrowRight size={18}/></button><button className="btn-text" onClick={restart}><RefreshCw size={16}/> تجربة البداية مجددًا</button></main>}
   <dialog ref={legalDialog} className="screen-content nf-sandbox-legal" aria-label="شروط الاستخدام والخصوصية في المعاينة"
     style={{position:'fixed',inset:0,width:'min(680px, calc(100vw - 28px))',maxHeight:'calc(100dvh - 32px)',border:'1px solid var(--line)',borderRadius:24,background:'var(--page-background)'}}
     onCancel={event=>{event.preventDefault();setLegal(false);}} onClose={()=>setLegal(false)}>
     <button type="button" className="btn-text" onClick={()=>setLegal(false)}><ArrowRight size={16}/> العودة للتجربة</button><LegalNotice preview/>
   </dialog>
 </section>;
}
