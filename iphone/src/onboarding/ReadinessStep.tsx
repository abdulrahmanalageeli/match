import { Check, ChevronDown, HeartHandshake, LockKeyhole, ShieldCheck } from '../BrandIcons';
import { MotionReveal } from '../motion/Reanimated';
import { membershipAgreementVersion, readinessBlueprint, readinessClarifications, readinessComplete, readinessConflicts, readinessScenarios, type MembershipReadiness as Readiness, type ReadinessAnswers, type ReadinessTopic } from './membershipReadiness';
import './membership-readiness.css';

export function ReadinessResult({ value, familyPreference, formalTiming, answers = {}, edit }: {
  value: Readiness;
  familyPreference: string;
  formalTiming?: string;
  answers?: ReadinessAnswers;
  edit?: () => void;
}) {
  const conflicts = readinessConflicts(value, familyPreference, formalTiming);
  const complete = readinessComplete(value, conflicts);
  const blueprint = readinessBlueprint(answers, value, conflicts);
  return <section className="nf-readiness-result" aria-label="ملخص توقعاتك وخريطة شراكتك">
    <div className="nf-readiness-result-heading">
      <span className="nf-readiness-result-mark" aria-hidden="true">{complete ? <Check size={20}/> : <HeartHandshake size={20}/>}</span>
      <div><small>لونا · ملخصك الخاص</small><h3>{complete ? 'اكتملت مراجعة توقعاتك' : 'ملامح الشراكة اللي تناسبك'}</h3></div>
      {edit && <button type="button" onClick={edit}>مراجعة</button>}
    </div>
    {complete && <p className="nf-readiness-result-note">إجاباتك واتفاقك جاهزة للإرسال لمراجعة العضوية.</p>}
    <dl className="nf-readiness-declarations">
      <div><dt>إشراك الأهل</dt><dd>{value.family && (value.clarifications?.family && conflicts.includes('family') ? readinessClarifications.family.options[value.clarifications.family] : readinessScenarios.family.options[value.family])}</dd></div>
      <div><dt>خطوتك القادمة</dt><dd>{value.nextStep && (value.clarifications?.nextStep && conflicts.includes('nextStep') ? readinessClarifications.nextStep.options[value.clarifications.nextStep] : readinessScenarios.nextStep.options[value.nextStep])}</dd></div>
    </dl>
    {(blueprint.preferences.length > 0 || blueprint.partnership) && <details className="nf-readiness-blueprint" open>
      <summary><span>خريطة شراكتك</span><ChevronDown size={15} aria-hidden="true"/></summary>
      {blueprint.partnership && <div className="nf-readiness-partnership"><small>الشراكة التي وصفتها</small><p>{blueprint.partnership}</p></div>}
      {blueprint.preferences.length > 0 && <div className="nf-readiness-preferences">
        {blueprint.preferences.map(preference => <article key={preference.id}>
          <h4>{preference.title}{preference.firm && <small>شرط أساسي عندك</small>}{!preference.firm && preference.priority && <small>ضمن أولوياتك</small>}</h4>
          <dl><div><dt>في حياتك</dt><dd>{preference.own}</dd></div><div><dt>في شريكك</dt><dd>{preference.partner}</dd></div></dl>
        </article>)}
      </div>}
    </details>}
    {blueprint.discussion.length > 0 && <div className="nf-readiness-discussion">
      <h4>نقاط تستحق حوارًا مبكرًا</h4>
      <ul>{blueprint.discussion.map(point => <li key={point}>{point}</li>)}</ul>
    </div>}
    <p className="nf-readiness-private"><LockKeyhole size={13} aria-hidden="true"/> هذا الملخص من إجاباتك، ويظهر لك وحدك.</p>
  </section>;
}

export function ReadinessStep({ value, familyPreference, formalTiming, answers, onChange }: {
  value: Readiness;
  familyPreference: string;
  formalTiming?: string;
  answers?: ReadinessAnswers;
  onChange: (value: Readiness) => void;
}) {
  const conflicts = readinessConflicts(value, familyPreference, formalTiming);
  const reviewed = value.family && value.nextStep && conflicts.every(topic => value.clarifications?.[topic]);
  function selectScenario(topic: ReadinessTopic, choice: string) {
    if (value[topic] === choice) return;
    const clarifications = { ...value.clarifications };
    delete clarifications[topic];
    onChange({ ...value, [topic]: choice, clarifications });
  }
  return <section className="nf-readiness-intake" aria-label="مواقف الجاهزية واتفاق العضوية">
    <p className="nf-readiness-intro">نتفق من البداية على مقصد الزواج، وحدود التواصل، وخطوة الأهل.</p>
    {(['family','nextStep'] as const).map(topic => <div className="nf-readiness-card" key={topic}>
      <fieldset>
        <legend>{readinessScenarios[topic].question}</legend>
        {Object.entries(readinessScenarios[topic].options).map(([choice,label]) => <button key={choice} type="button" aria-pressed={value[topic] === choice} onClick={() => selectScenario(topic, choice)}>
          <span>{label}</span>{value[topic] === choice && <Check size={16} aria-hidden="true"/>}
        </button>)}
      </fieldset>
      {conflicts.includes(topic) && <MotionReveal className="nf-readiness-clarify" duration={200} distance={5}>
        <small><HeartHandshake size={15} aria-hidden="true"/> لونا · خلّنا نوضحها</small>
        <fieldset>
          <legend>{readinessClarifications[topic].question}</legend>
          {Object.entries(readinessClarifications[topic].options).map(([choice,label]) => <button key={choice} type="button" aria-pressed={value.clarifications?.[topic] === choice}
            onClick={() => onChange({ ...value, clarifications: { ...value.clarifications, [topic]: choice as 'context' | 'review' } })}>
            <span>{label}</span>{value.clarifications?.[topic] === choice && <Check size={16} aria-hidden="true"/>}
          </button>)}
        </fieldset>
      </MotionReveal>}
    </div>)}
    <div className="nf-readiness-card nf-readiness-agreement">
      <h3><ShieldCheck size={18} aria-hidden="true"/> اتفاق العضوية</h3>
      <ul>
        <li>أستخدم وُدَين للتعارف الجاد بقصد الزواج.</li>
        <li>أحترم حدود التواصل وخصوصية الصور والمعلومات.</li>
        <li>أتفق مع الطرف الآخر على التوقيت وإشراك الأهل قبل الانتقال للخطوة الرسمية.</li>
      </ul>
      <label><input type="checkbox" checked={value.agreement === membershipAgreementVersion} onChange={event => onChange({ ...value, agreement: event.target.checked ? membershipAgreementVersion : undefined })}/> أوافق على اتفاق العضوية</label>
    </div>
    {reviewed && <MotionReveal className="nf-readiness-summary" duration={240} distance={6}>
      <ReadinessResult value={value} familyPreference={familyPreference} formalTiming={formalTiming} answers={answers}/>
    </MotionReveal>}
  </section>;
}
