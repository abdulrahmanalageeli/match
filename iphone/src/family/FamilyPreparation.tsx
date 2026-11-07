import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ClipboardList } from 'lucide-react';
import type { FamilyRoom } from './model';
import { KeyboardDismiss } from '../mobile/KeyboardDismiss';

const planFields = [
  ['purpose', 'الخطوة المقترحة', 'مثل: لقاء تعارف عائلي'],
  ['person', 'من ينسّق مع من؟', 'الأسماء التي توافقون على ذكرها'],
  ['channel', 'طريقة التواصل أو المكان', 'مثل: التنسيق داخل هذه المساحة'],
  ['time', 'وقت مقترح', 'موعد يناسبكم أو وقت للعودة إلى النقاش'],
] as const;
const introductionFields = [
  ['about', 'ما أختار تعريف الأسرة به عن نفسي', 'نبذة موجزة تختار مشاركتها'],
  ['intention', 'ما أبحث عنه في الزواج', 'النية والتوقعات التي تريد توضيحها'],
  ['time', 'الوقت المناسب لي والخطوة التالية', 'ما أنت مستعد لمناقشته الآن'],
] as const;
const practicalQuestions = [
  'ما تصورنا للسكن والمدينة والقرب من الأهل؟',
  'كيف نناقش تكاليف الزواج والمهر والخطة المالية بوضوح وراحة للطرفين؟',
  'كيف نوفق بين العمل والدراسة ومسؤوليات البيت؟',
  'ما توقعاتنا بشأن الأطفال ومسؤوليات الأسرة؟',
  'ما المعلومات التي نحتاج إلى سؤال صاحبها عنها قبل اتخاذ الخطوة التالية؟',
];

/** Builds only a user-written draft. It never reads a profile or sends a message. */
export function FamilyPreparation({ room, guardian, open, onDraft, onClose }: { room: FamilyRoom; guardian: boolean; open: boolean; onDraft: (body: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  const [kind, setKind] = useState<'plan' | 'introduction'>('plan');
  const [drafts, setDrafts] = useState<Record<'plan' | 'introduction', Record<string, string>>>({ plan: {}, introduction: {} });
  const [questions, setQuestions] = useState<string[]>([]), [consent, setConsent] = useState(false);
  const values = drafts[kind];
  const fields = kind === 'plan' ? planFields : introductionFields;
  const lines = fields.flatMap(([id, label]) => values[id]?.trim() ? [`${label}: ${values[id].trim()}`] : []);
  const chosenQuestions = kind === 'plan' ? questions : [];
  const body = [kind === 'plan' ? 'اقتراح للخطوة العائلية التالية' : 'تعريف أختار مشاركته مع الأسرة', ...lines, ...(chosenQuestions.length ? ['أسئلة نناقشها معًا:', ...chosenQuestions.map(question => `• ${question}`)] : []), kind === 'plan' ? 'هذا اقتراح للنقاش، وليس موعدًا أو اتفاقًا نهائيًا. ننتظر رأي كل شخص معني.' : 'هذه إفادتي الشخصية، وليست بيانات تحققت منها نصفين.'].join('\n');
  const canPrepare = consent && (lines.length > 0 || chosenQuestions.length > 0) && body.length <= 1000;
  useEffect(() => { const element = dialog.current; setConsent(false); if (open) element?.showModal(); else element?.close(); return () => element?.close(); }, [open]);
  return <dialog ref={dialog} className="fb-preparation" dir="rtl" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><button type="button" className="fb-back" onClick={onClose}><ArrowRight size={18}/> رجوع</button><ClipboardList size={22}/></header>
    <h2 id={titleId}>جهّزوا خطوة واضحة</h2>
    <p>اكتب ما تختار مشاركته فقط. ستراجع النص في خانة الرسالة قبل إرساله بنفسك.</p>
    <p className="fb-preparation-audience"><strong>سيرى الرسالة المشاركون الحاليون في هذه المساحة:</strong> {room.participants.filter(person => !person.left).map(person => person.name).join('، ')}</p>
    <p className="fb-caption">يبقى ما تكتبه عند تغيير نوع الرسالة أو إغلاق هذه النافذة. يُمسح عند مغادرة المحادثة أو إغلاق التطبيق.</p>
    {!guardian && <label className="fb-field">نوع الرسالة<select value={kind} onChange={event => { setKind(event.target.value as 'plan' | 'introduction'); setConsent(false); }}><option value="plan">تنسيق الخطوة القادمة</option><option value="introduction">تعريف أختار مشاركته عن نفسي</option></select></label>}
    <form onSubmit={event => { event.preventDefault(); if (canPrepare) onDraft(body); }}>
      {fields.map(([id, label, placeholder]) => <label className="fb-field" key={`${kind}-${id}`}><span>{label} <small>اختياري</small></span><textarea value={values[id] ?? ''} onChange={event => { const value = event.target.value; setDrafts(current => ({ ...current, [kind]: { ...current[kind], [id]: value } })); setConsent(false); }} maxLength={kind === 'introduction' ? 180 : 120} rows={2} placeholder={placeholder}/></label>)}
      {kind === 'plan' && <fieldset className="fb-practical-topics"><legend>موضوع عملي نختار مناقشته <small>اختياري</small></legend>{practicalQuestions.map(question => <label key={question}><input type="checkbox" checked={questions.includes(question)} onChange={event => { setQuestions(current => event.target.checked ? [...current, question] : current.filter(item => item !== question)); setConsent(false); }}/><span>{question}</span></label>)}</fieldset>}
      <p className="fb-caption">لا ننسخ ملفًا أو محادثة أو جواز جاهزية. لا تكتب بيانات شخص آخر أو وثائقه دون إذنه. لا يمكن سحب نسخة يحتفظ بها أحد خارج التطبيق.</p>
      <label className="fb-preparation-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>راجعت الأسماء وأختار مشاركة هذا النص معهم عند الضغط على إرسال.</span></label>
      {body.length > 1000 && <p className="fb-error" role="alert">اختصر النص أو قلّل الأسئلة ليكون في حدود ١٠٠٠ حرف.</p>}
      <KeyboardDismiss/>
      <button type="submit" className="btn-primary fb-full" disabled={!canPrepare}>مراجعة النص في خانة الرسالة</button>
    </form>
  </dialog>;
}
