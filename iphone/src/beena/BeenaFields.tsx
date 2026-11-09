import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Feather, HeartHandshake, LockKeyhole, MessageCircle, Sparkles, Trash2 } from "../BrandIcons";
import { beenaProgress, beenaScenarios, beenaVersion, type BeenaAnswer, type BeenaProfile } from './model';
import './beena.css';
import '../onboarding/scenario-experience.css';

const number = new Intl.NumberFormat('ar-SA', { numberingSystem: 'arab' });

export function BeenaFields({ value, onChange, storyReview = true, registration = false }: { value?: BeenaProfile | null; onChange: (value: BeenaProfile | null) => void; storyReview?: boolean; registration?: boolean }) {
  const [mode, setMode] = useState<'situations' | 'story'>(() => value?.story?.text && !Object.keys(value.answers).length ? 'story' : 'situations');
  const [index, setIndex] = useState(0);
  const [perspective, setPerspective] = useState<'self' | 'partner'>('self');
  const [finished, setFinished] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scene = useRef<HTMLElement>(null);
  const completion = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const id = useId();
  const scenario = beenaScenarios[index];
  const answer = value?.answers[scenario.id] ?? {};
  const progress = beenaProgress(value);
  const current = (): BeenaProfile => value ?? { version: beenaVersion, answers: {} };
  const answered = (scenarioId: string) => Boolean(value?.answers[scenarioId]?.self && value.answers[scenarioId]?.partner?.length);

  useLayoutEffect(() => {
    const target = finished && mode === 'situations' ? completion.current : moved.current ? scene.current : null;
    if (!target) return;
    moved.current = false;
    const reduced = document.documentElement.dataset.nfMotion === 'reduced'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (target === completion.current ? completion.current : heading.current)?.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
  }, [index, perspective, mode, finished]);
  function changeAnswer(patch: Partial<BeenaAnswer>) {
    const next = { ...answer, ...patch };
    onChange({ ...current(), answers: { ...value?.answers, [scenario.id]: next } });
    setFinished(false);
  }
  function move(next: number, side: 'self' | 'partner' = 'self') {
    moved.current = true;
    setIndex(Math.max(0, Math.min(beenaScenarios.length - 1, next)));
    setPerspective(side);
    setFinished(false);
  }
  function advance() {
    if (perspective === 'self') { move(index, 'partner'); return; }
    if (index < beenaScenarios.length - 1) move(index + 1);
    else setFinished(true);
  }
  function changeMode(next: 'situations' | 'story') { moved.current = true; setMode(next); }
  function changeStory(patch: Partial<NonNullable<BeenaProfile['story']>>) {
    onChange({ ...current(), story: { scenarioId: scenario.id, text: '', share: false, ...value?.story, ...patch } });
  }
  function clearStory() { const next = { ...current() }; delete next.story; onChange(next); }

  return <section className="bn-fields" aria-label="بيننا: مواقف الحياة" data-field="beena" tabIndex={-1}>
    {!registration && <header className="bn-intro">
      <span className="bn-emblem" aria-hidden="true"><HeartHandshake size={25} strokeWidth={1.4}/></span>
      <div><span className="bn-eyebrow">بيننا · الحياة كما نعيشها</span><h2>موقف صغير. فهم أعمق.</h2><p>كيف تتصرف، وما الذي ترتاح إليه من شريكك؟ قد تتشابه إجاباتكما أو تتكامل.</p></div>
    </header>}
    <div className="bn-modes" role="group" aria-label="طريقة المشاركة في بيننا">
      <button type="button" aria-pressed={mode === 'situations'} onClick={() => changeMode('situations')}><MessageCircle size={17}/> مواقف الحياة <small>{number.format(progress.answered)}/{number.format(progress.total)}</small></button>
      <button type="button" aria-pressed={mode === 'story'} onClick={() => changeMode('story')}><Feather size={17}/> أكتب موقفًا</button>
    </div>

    {mode === 'situations' ? <>
      <div className="bn-progress"><div><span>ستة مواقف، على مهل</span><strong>{number.format(progress.answered)} من {number.format(progress.total)} مكتملة</strong></div><progress value={progress.answered} max={progress.total} aria-label="اكتمال مواقف بيننا"/></div>
      <details className="bn-map"><summary>خريطة المواقف <ChevronDown size={15}/></summary><div>{beenaScenarios.map((entry, position) => <button key={entry.id} type="button" aria-current={index === position ? 'step' : undefined} onClick={() => move(position)}><span className="bn-map-index">{answered(entry.id) ? <Check size={13}/> : number.format(position + 1)}</span>{entry.title}</button>)}</div></details>
      <article className="bn-scene" key={scenario.id + perspective} ref={scene}>
        <div className="bn-scene-heading"><span><BookOpen size={15}/> {scenario.title}</span><small>موقف {number.format(index + 1)} / {number.format(beenaScenarios.length)}</small></div>
        <p className="bn-story-scene">{scenario.scene}</p>
        <div className="bn-perspectives" role="group" aria-label="زاوية الإجابة في الموقف">
          <button type="button" aria-pressed={perspective === 'self'} onClick={() => move(index, 'self')}>تصرفي الأقرب {answer.self && <Check size={13} aria-label="أجبت"/>}</button>
          <button type="button" aria-pressed={perspective === 'partner'} onClick={() => move(index, 'partner')}>ما أتقبّله من شريكي {!!answer.partner?.length && <Check size={13} aria-label="أجبت"/>}</button>
        </div>
        <h3 ref={heading} tabIndex={-1}>{perspective === 'self' ? 'ما التصرف الأقرب لك؟' : 'أي التصرفات ترتاح إليها من شريكك؟'}</h3>
        <p className="bn-answer-hint">{perspective === 'self' ? 'اختر ما تفعله عادةً، لا ما يبدو مثاليًا.' : 'يمكنك اختيار أكثر من تصرف. ليس ضروريًا أن يشبه تصرفك.'}</p>
        <div className="bn-options" role="group" aria-label={perspective === 'self' ? 'تصرفي في ' + scenario.title : 'تصرفات الشريك المقبولة في ' + scenario.title}>
          {scenario.options.map(option => {
            const selected = perspective === 'self' ? answer.self === option.code : Boolean(answer.partner?.includes(option.code));
            return <button type="button" key={option.code} aria-pressed={selected} onClick={() => perspective === 'self'
              ? changeAnswer({ self: selected ? undefined : option.code })
              : changeAnswer({ partner: selected ? answer.partner?.filter(code => code !== option.code) : [...(answer.partner ?? []), option.code] })}>
              <span className="bn-option-check" data-multiple={perspective === 'partner' || undefined} aria-hidden="true">{selected && <Check size={13}/>}</span><span>{option.label}</span>
            </button>;
          })}
        </div>
        {perspective === 'partner' && <div className="bn-importance"><span id={id + '-importance'}>أهمية هذا الموقف لك</span><div role="group" aria-labelledby={id + '-importance'}><button type="button" aria-pressed={(answer.importance ?? 1) === 1} onClick={() => changeAnswer({ importance: 1 })}>أهمية عادية</button><button type="button" aria-pressed={answer.importance === 2} onClick={() => changeAnswer({ importance: 2 })}>مهم لي <Sparkles size={12}/></button></div><small>يزيد وزن الموقف في القراءة، ولا يستبعد شخصًا تلقائيًا.</small></div>}
        <nav className="bn-scene-navigation" aria-label="التنقل بين مواقف بيننا">
          <button type="button" className="bn-back" disabled={index === 0 && perspective === 'self'} onClick={() => perspective === 'partner' ? move(index) : move(index - 1, 'partner')}><ArrowRight size={15}/> السابق</button>
          <button type="button" className="bn-next" onClick={advance}>{perspective === 'self' ? 'وماذا عن شريكك؟' : index === beenaScenarios.length - 1 ? 'مراجعة المواقف' : 'الموقف التالي'}<ArrowLeft size={15}/></button>
        </nav>
        <button type="button" className="bn-skip" onClick={() => index < beenaScenarios.length - 1 ? move(index + 1) : setFinished(true)}>أكمل هذا الموقف لاحقًا</button>
      </article>
      {finished && <div className="bn-completion" role="status" ref={completion} tabIndex={-1}><span><Check size={20}/></span><div><strong>{progress.complete ? 'اكتملت مواقفك الستة.' : 'كل إجابة تقرّب الصورة.'}</strong><p>{progress.complete ? 'تظهر قراءة المواقف عند إكمال الطرف الآخر أيضًا. يمكنك مراجعة أي إجابة أو إضافة موقف بكلماتك.' : `أكملت ${number.format(progress.answered)} من ${number.format(progress.total)} مواقف. يمكنك العودة للبقية لاحقًا؛ لن تظهر نسبة قبل اكتمال إجابات الطرفين.`}</p><button type="button" onClick={() => changeMode('story')}><Feather size={14}/> أضف موقفًا بكلماتك</button></div></div>}
    </> : <article className="bn-story-editor" ref={scene}>
      <div className="bn-story-editor-heading"><span><Feather size={21}/></span><div><small>مساحة لصوتك أنت</small><h3 ref={heading} tabIndex={-1}>احكِ ما لا تختصره الخيارات.</h3></div></div>
      <p>اكتب موقفًا تتخيله في حياتكما، وكيف تود أن تتعاملا معه. يمكنك الاكتفاء بالقصة أو إكمال المواقف أيضًا.</p>
      <label htmlFor={id + '-topic'}>موضوع الموقف<select id={id + '-topic'} value={value?.story?.scenarioId ?? scenario.id} onChange={event => changeStory({ scenarioId: event.target.value })}>{beenaScenarios.map(entry => <option value={entry.id} key={entry.id}>{entry.title}</option>)}</select></label>
      <label htmlFor={id + '-story'}>بكلماتك أنت<textarea id={id + '-story'} value={value?.story?.text ?? ''} rows={5} maxLength={1000} onChange={event => changeStory({ text: Array.from(event.target.value).slice(0, 500).join('') })} placeholder={beenaScenarios.find(entry => entry.id === (value?.story?.scenarioId ?? scenario.id))?.storyPrompt} aria-describedby={id + '-story-help'}/></label>
      <div className="bn-story-count"><span>اختياري</span><span>{number.format(Array.from(value?.story?.text ?? '').length)} / ٥٠٠</span></div>
      <label className="bn-share"><input type="checkbox" checked={value?.story?.share === true} onChange={event => changeStory({ share: event.target.checked })}/><span><strong>أعرض القصة في ملفي للأعضاء المؤهلين</strong><small>مشاركة اختيارية. دون هذا الاختيار تبقى القصة خاصة بك. يمكنك إخفاؤها أو حذفها لاحقًا.</small></span></label>
      <p className="bn-story-help" id={id + '-story-help'}>القصة بداية حوار، ولا تدخل كلماتها في النسبة أو تُحلَّل بالذكاء الاصطناعي. تجنّب أسماء الآخرين وأرقام التواصل والتفاصيل الحساسة.</p>
      {storyReview && <p className="bn-story-help">نشر قصة جديدة يتطلب مراجعة الملف. إن كان ملفك معتمدًا، يتوقف ظهوره والتواصل مؤقتًا حتى اعتماد التحديث؛ تبقى التعارفات محفوظة. حفظ القصة بشكل خاص لا يغيّر حالة ملفك.</p>}
      {value?.story && <button type="button" className="bn-clear" onClick={clearStory}><Trash2 size={14}/> حذف القصة من المسودة</button>}
    </article>}
    {registration && <details className="nf-question-about"><summary><BookOpen size={15} aria-hidden="true"/><span>عن مواقف «بيننا»</span><ChevronDown size={15} aria-hidden="true"/></summary><div><strong>بيننا · الحياة كما نعيشها</strong><h2>موقف صغير. فهم أعمق.</h2><p>كيف تتصرف، وما الذي ترتاح إليه من شريكك؟ قد تتشابه إجاباتكما أو تتكامل.</p></div></details>}
    <p className="bn-save-hint">راجع إجاباتك، ثم استخدم زر المتابعة أو حفظ الملف في الصفحة لحفظ تغييراتك.</p>
    {value && <div className="bn-reset">{deleting ? <div role="group" aria-label="تأكيد حذف بيانات بيننا"><p>حذف جميع إجابات «بيننا» والقصة؟ تختفي قراءة المواقف بعد حفظ الملف، ويمكنك البدء مجددًا.</p><div><button type="button" onClick={() => { onChange(null); setDeleting(false); setFinished(false); setIndex(0); setPerspective('self'); setMode('situations'); }}>نعم، احذف من المسودة</button><button type="button" onClick={() => setDeleting(false)}>احتفظ بها</button></div></div> : <button type="button" className="bn-clear" onClick={() => setDeleting(true)}><Trash2 size={14}/> حذف إجابات بيننا والقصة</button>}</div>}
    <p className="bn-privacy"><LockKeyhole size={15} aria-hidden="true"/><span>إجابات الاختيارات خاصة. نعرض مواضيع الانسجام والنقاش، ونحسب القراءة من مدى تقبّل كل طرف لتصرف الآخر. ليست توقعًا لنجاح الزواج.</span></p>
  </section>;
}
