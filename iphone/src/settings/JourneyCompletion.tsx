import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, HeartHandshake, X } from "../BrandIcons";
import { Brand } from '../Brand';
import { SupportContact } from '../help/SupportContact';

type Props = {
  paused: boolean;
  busy: boolean;
  demo: boolean;
  canPause: boolean;
  onBack: () => void;
  onPause: () => void;
  onMembership?: () => void;
  onFamily?: () => void;
  onReadiness?: () => void;
};

function PauseForNextStep({ busy, close, confirm }: { busy: boolean; close: () => void; confirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog ref={dialog} className="st-dialog st-data-dialog" dir="rtl" aria-labelledby="completion-pause-title"
    onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header className="st-data-head"><h2 id="completion-pause-title">إيقاف الترشيحات الآن؟</h2><button className="st-data-close" onClick={close} disabled={busy} aria-label="إغلاق"><X size={20}/></button></header>
    <p>يُخفى ملفك عن الطلبات الجديدة ويُغلق الترشيح المقترح. تبقى المحادثات المقبولة وجسر الأهل متاحة مع صلاحية العضوية. يمكن استئناف الترشيحات من الإعدادات، لكن الترشيح المغلق لا يعود تلقائيًا.</p>
    <p>لا يُعلن هذا خطوبة أو زواجًا، ولا يغيّر حالة الطرف الآخر. يستمر اشتراك Apple حتى تلغي تجديده.</p>
    <form onSubmit={event => { event.preventDefault(); if (!busy) { confirm(); close(); } }}>
      <button className="btn-secondary" type="button" autoFocus onClick={close} disabled={busy}>العودة لترتيب الخطوة</button>
      <button className="btn-primary" disabled={busy}>إيقاف الترشيحات</button>
    </form>
  </dialog>;
}

export function JourneyCompletion({ paused, busy, demo, canPause, onBack, onPause, onMembership, onFamily, onReadiness }: Props) {
  const [stage, setStage] = useState('proceeding');
  const [confirmPause, setConfirmPause] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo(0, 0); title.current?.focus(); }, []);
  return <main className="app-screen st-completion" dir="rtl"><div className="screen-content">
    <header className="st-top"><button className="st-back" onClick={onBack}><ArrowRight size={18}/> الإعدادات</button><Brand compact/></header>
    <span className="st-dialog-icon" aria-hidden="true"><HeartHandshake/></span>
    <h1 ref={title} tabIndex={-1}>نحو بداية جديدة</h1>
    <p>وجدتما ما يستحق الاستمرار؟ رتّب خطواتك وظهور ملفك واشتراكك بهدوء. هذه مساحة خاصة بك، ولا تنشر قصة نجاح أو تتخذ قرارًا نيابة عن الطرف الآخر.</p>
    <label className="st-completion-stage">ما الخطوة التي ترتّب لها؟<select value={stage} onChange={event => setStage(event.target.value)}>
      <option value="proceeding">نرغب في التقدم معًا</option><option value="engaged">تمت الخطوبة</option><option value="married">تم الزواج</option>
    </select></label>
    <p className="st-completion-note">اختيارك يعرض إرشادًا لهذه الزيارة فقط؛ لا يسجّل حالة علاقة ولا يرسل إشعارًا.</p>
    <section className="st-completion-card"><h2>١ · اتفقا على الخطوة القادمة</h2>
      <p>{stage === 'married' ? 'نتمنى لكما حياة طيبة. راجعا ما تريدان الاحتفاظ به من بياناتكما، وأغلقا المشاركة التي لم تعودا تحتاجانها، كلٌّ من حسابه.' : stage === 'engaged' ? 'نتمنى لكما بداية موفقة. اتفقا على التواصل مع العائلتين وترتيبات المرحلة القادمة، وما تريدان إبقاءه داخل التطبيق.' : 'تأكدا معًا من الرغبة في الاستمرار، وحددا من يتواصل مع من، والغرض من اللقاء أو الاتصال وموعدًا مقترحًا. إعلان الخطوبة أو الزواج يحتاج اتفاقكما خارج هذه الصفحة.'}</p>
      <div className="st-completion-actions">{onFamily && <button className="btn-secondary" onClick={onFamily}>ترتيب الخطوة مع الأهل</button>}{onReadiness && <button className="btn-secondary" onClick={onReadiness}>مراجعة استعداداتي الخاصة</button>}</div>
    </section>
    <section className="st-completion-card"><h2>٢ · اختر ظهور ملفك</h2>
      {paused ? <p role="status" className="st-completion-status"><Check size={18}/> الترشيحات متوقفة وملفك مخفي عن الطلبات الجديدة؛ تبقى المحادثات المقبولة متاحة مع صلاحية العضوية.</p> : <><p>إيقاف الترشيحات يخفي ملفك عن الطلبات الجديدة ويحافظ على المحادثات المقبولة وجسر الأهل مع صلاحية العضوية. لا يُوقف حساب الطرف الآخر تلقائيًا.</p>{canPause ? <button className="btn-primary" disabled={busy} onClick={() => setConfirmPause(true)}>مراجعة إيقاف الترشيحات</button> : <p>تحكم إيقاف الترشيحات متاح مع العضوية الفعّالة. يمكنك مراجعة حالة حسابك من الإعدادات أو التواصل مع الفريق.</p>}</>}
    </section>
    <section className="st-completion-card"><h2>٣ · راجع الاشتراك والبيانات</h2>
      <p>{demo ? 'هذه تجربة مجانية ولا توجد دفعة لإلغائها. في الحساب الحقيقي، إيقاف الترشيحات أو حذف الحساب لا يلغي اشتراك Apple.' : 'إيقاف الترشيحات أو حذف الحساب لا يلغي اشتراك Apple. افتح عضويتك ثم إدارة الاشتراك لإيقاف التجديد، وتحقق من تأكيد Apple.'}</p>
      <p>تجد «نسخة من بياناتي» و«حذف حسابي» في الإعدادات. المشاركة الخاصة بالصور والجواز قابلة للإيقاف من أدواتها؛ لا يمكن سحب ما احتفظ به الآخرون سابقًا.</p>
      {onMembership && <button className="btn-secondary" onClick={onMembership}>مراجعة العضوية وإدارة الاشتراك</button>}
    </section>
    <SupportContact subject="مساعدة في إكمال رحلتي في وُدَين"/>
    {confirmPause && <PauseForNextStep busy={busy} close={() => setConfirmPause(false)} confirm={onPause}/>}
  </div></main>;
}
