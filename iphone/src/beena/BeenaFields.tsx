import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Feather, HeartHandshake, LockKeyhole, MessageCircle, Sparkles, Trash2 } from "../BrandIcons";
import { beenaProgress, beenaScenarios, beenaVersion, type BeenaAnswer, type BeenaProfile } from './model';
import { hasScenarioAnswer } from '../onboarding/remainingAssessments';
import './beena.css';
import '../onboarding/scenario-experience.css';

const number = new Intl.NumberFormat('ar-SA', { numberingSystem: 'arab' });

export function BeenaFields({ value, onChange, storyReview = true, registration = false, remainingOnly = false }: { value?: BeenaProfile | null; onChange: (value: BeenaProfile | null) => void; storyReview?: boolean; registration?: boolean; remainingOnly?: boolean }) {
  const [mode, setMode] = useState<'situations' | 'story'>(() => value?.story?.text && !Object.keys(value.answers).length ? 'story' : 'situations');
  const [requestedIndex, setIndex] = useState(0);
  const completedHere = useRef(new Set<number>()), previousMode = useRef(remainingOnly);
  if (previousMode.current !== remainingOnly) { completedHere.current.clear(); previousMode.current = remainingOnly; }
  const [requestedPerspective, setPerspective] = useState<'self' | 'partner'>('self');
  const [finished, setFinished] = useState(false);
  useLayoutEffect(() => { setFinished(false); }, [remainingOnly]);
  const [deleting, setDeleting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scene = useRef<HTMLElement>(null);
  const completion = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const id = useId();
  const positions = beenaScenarios.flatMap((entry, at) => [at*2,at*2+1].filter(position => !remainingOnly || completedHere.current.has(position)
    || !hasScenarioAnswer(entry.options,value?.answers[entry.id],position%2===0?'self':'partner')));
  const requestedPosition = requestedIndex*2 + Number(requestedPerspective==='partner');
  const position = positions.includes(requestedPosition) ? requestedPosition : positions.find(at=>at>=requestedPosition) ?? positions[0] ?? 0;
  const index = Math.floor(position/2), perspective = position%2===0 ? 'self' : 'partner';
  const questionIndex = positions.indexOf(position);
  const remainingDone = remainingOnly && (finished || positions.length===0);
  const scenario = beenaScenarios[index];
  const answer = value?.answers[scenario.id] ?? {};
  const progress = beenaProgress(value);
  const current = (): BeenaProfile => value ?? { version: beenaVersion, answers: {} };
  const answered = (scenarioId: string) => { const entry=beenaScenarios.find(item=>item.id===scenarioId)!;return hasScenarioAnswer(entry.options,value?.answers[scenarioId],'self')&&hasScenarioAnswer(entry.options,value?.answers[scenarioId],'partner'); };

  useLayoutEffect(() => {
    const target = (finished || remainingDone) && mode === 'situations' ? completion.current : moved.current ? scene.current : null;
    if (!target) return;
    moved.current = false;
    const reduced = document.documentElement.dataset.nfMotion === 'reduced'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (target === completion.current ? completion.current : heading.current)?.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
  }, [index, perspective, mode, finished, remainingDone]);
  function changeAnswer(patch: Partial<BeenaAnswer>) {
    completedHere.current.add(position);
    const next = { ...answer, ...patch };
    onChange({ ...current(), answers: { ...value?.answers, [scenario.id]: next } });
    setFinished(false);
  }
  function move(next: number, side: 'self' | 'partner' = 'self') {
    if (remainingOnly && !positions.includes(next*2+Number(side==='partner'))) {
      if (positions.includes(next*2+Number(side==='self'))) side=side==='self'?'partner':'self'; else return;
    }
    moved.current = true;
    setIndex(Math.max(0, Math.min(beenaScenarios.length - 1, next)));
    setPerspective(side);
    setFinished(false);
  }
  function advance() {
    if (remainingOnly) {
      const next = positions[questionIndex+1];
      if (next===undefined) setFinished(true); else move(Math.floor(next/2),next%2===0?'self':'partner');
      return;
    }
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
      {!remainingDone && <details className="bn-map"><summary>خريطة المواقف <ChevronDown size={15}/></summary><div>{beenaScenarios.flatMap((entry, position) => remainingOnly && !positions.includes(position*2) && !positions.includes(position*2+1) ? [] : [<button key={entry.id} type="button" aria-current={index === position ? 'step' : undefined} onClick={() => move(position)}><span className="bn-map-index">{answered(entry.id) ? <Check size={13}/> : number.format(position + 1)}</span>{entry.title}</button>])}</div></details>}
      {!remainingDone && <article className="bn-scene" key={scenario.id + perspective} ref={scene}>
        <div className="bn-scene-heading"><span><BookOpen size={15}/> {scenario.title}</span><small>موقف {number.format(index + 1)} / {number.format(beenaScenarios.length)}</small></div>
        <p className="bn-story-scene">{scenario.scene}</p>
        <div className="bn-perspectives" role="group" aria-label="زاوية الإجابة في الموقف">
          {(!remainingOnly||positions.includes(index*2))&&<button type="button" aria-pressed={perspective === 'self'} onClick={() => move(index, 'self')}>تصرفي الأقرب {answer.self && <Check size={13} aria-label="أجبت"/>}</button>}
          {(!remainingOnly||positions.includes(index*2+1))&&<button type="button" aria-pressed={perspective === 'partner'} onClick={() => move(index, 'partner')}>ما أتقبّله من شريكي {!!answer.partner?.length && <Check size={13} aria-label="أجبت"/>}</button>}
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
          <button type="button" className="bn-back" disabled={questionIndex<=0} onClick={() => {const previous=positions[questionIndex-1];if(previous!==undefined)move(Math.floor(previous/2),previous%2===0?'self':'partner')}}><ArrowRight size={15}/> السابق</button>
          <button type="button" className="bn-next" onClick={advance}>{remainingOnly ? questionIndex===positions.length-1?'مراجعة المواقف':'السؤال التالي' : perspective === 'self' ? 'وماذا عن شريكك؟' : index === beenaScenarios.length - 1 ? 'مراجعة المواقف' : 'الموقف التالي'}<ArrowLeft size={15}/></button>
        </nav>
        <button type="button" className="bn-skip" onClick={() => {const next=positions.find(at=>Math.floor(at/2)>index);if(next===undefined)setFinished(true);else move(Math.floor(next/2),next%2===0?'self':'partner')}}>أكمل هذا الموقف لاحقًا</button>
      </article>}
      {(finished || remainingDone) && <div className="bn-completion" role="status" ref={completion} tabIndex={-1}><span><Check size={20}/></span><div><strong>{progress.complete ? 'اكتملت مواقفك الستة.' : 'كل إجابة تقرّب الصورة.'}</strong><p>{progress.complete ? 'تظهر قراءة المواقف عند إكمال الطرف الآخر أيضًا. يمكنك مراجعة أي إجابة أو إضافة موقف بكلماتك.' : `أكملت ${number.format(progress.answered)} من ${number.format(progress.total)} مواقف. يمكنك العودة للبقية لاحقًا؛ لن تظهر نسبة قبل اكتمال إجابات الطرفين.`}</p>{remainingOnly&&!progress.complete&&<button type="button" onClick={()=>{completedHere.current.clear();setFinished(false);setIndex(0);setPerspective('self')}}>إكمال المتبقي<ArrowLeft size={14}/></button>}<button type="button" onClick={() => changeMode('story')}><Feather size={14}/> أضف موقفًا بكلماتك</button></div></div>}
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
    {remainingOnly && <details className="nf-question-about"><summary><Sparkles size={15}/><span>أهمية المواقف لك · اختياري</span><ChevronDown size={15}/></summary><div>{beenaScenarios.filter(entry=>hasScenarioAnswer(entry.options,value?.answers[entry.id],'self')||hasScenarioAnswer(entry.options,value?.answers[entry.id],'partner')).map(entry=><div className="bn-importance" key={entry.id}><span>{entry.title}</span><div role="group" aria-label={`أهمية ${entry.title}`}>{([1,2] as const).map(importance=><button type="button" key={importance} aria-pressed={(value?.answers[entry.id]?.importance??1)===importance} onClick={()=>onChange({...current(),answers:{...value?.answers,[entry.id]:{...value?.answers[entry.id],importance}}})}>{importance===1?'أهمية عادية':'مهم لي'}</button>)}</div></div>)}<p>تغيير الأهمية لا يغيّر اختياراتك ولا يستبعد شخصًا تلقائيًا.</p></div></details>}
    {registration && <details className="nf-question-about"><summary><BookOpen size={15} aria-hidden="true"/><span>عن مواقف «بيننا»</span><ChevronDown size={15} aria-hidden="true"/></summary><div><strong>بيننا · الحياة كما نعيشها</strong><h2>موقف صغير. فهم أعمق.</h2><p>كيف تتصرف، وما الذي ترتاح إليه من شريكك؟ قد تتشابه إجاباتكما أو تتكامل.</p></div></details>}
    <p className="bn-save-hint">راجع إجاباتك، ثم استخدم زر المتابعة أو حفظ الملف في الصفحة لحفظ تغييراتك.</p>
    {value && <div className="bn-reset">{deleting ? <div role="group" aria-label="تأكيد حذف بيانات بيننا"><p>حذف جميع إجابات «بيننا» والقصة؟ تختفي قراءة المواقف بعد حفظ الملف، ويمكنك البدء مجددًا.</p><div><button type="button" onClick={() => { onChange(null); setDeleting(false); setFinished(false); setIndex(0); setPerspective('self'); setMode('situations'); }}>نعم، احذف من المسودة</button><button type="button" onClick={() => setDeleting(false)}>احتفظ بها</button></div></div> : <button type="button" className="bn-clear" onClick={() => setDeleting(true)}><Trash2 size={14}/> حذف إجابات بيننا والقصة</button>}</div>}
    <p className="bn-privacy"><LockKeyhole size={15} aria-hidden="true"/><span>إجابات الاختيارات خاصة. نعرض مواضيع الانسجام والنقاش، ونحسب القراءة من مدى تقبّل كل طرف لتصرف الآخر. ليست توقعًا لنجاح الزواج.</span></p>
  </section>;
}
