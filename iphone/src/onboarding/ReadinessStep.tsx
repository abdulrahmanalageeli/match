import { Check, ChevronDown, HeartHandshake, LockKeyhole, ShieldCheck } from '../BrandIcons';
import { MotionReveal } from '../motion/Reanimated';
import { membershipAgreementVersion, readinessClarifications, readinessConflicts, readinessScenarios, type MembershipReadiness as Readiness, type ReadinessTopic } from './membershipReadiness';
import './membership-readiness.css';

export function ReadinessStep({ value, familyPreference, formalTiming, onChange }: {
  value: Readiness;
  familyPreference: string;
  formalTiming?: string;
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
    <p className="nf-readiness-private"><LockKeyhole size={15} aria-hidden="true"/> ملخص خاص بك</p>
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
    {reviewed && <MotionReveal duration={200} distance={5}>
      <details className="nf-readiness-card nf-readiness-summary" open>
        <summary><HeartHandshake size={17} aria-hidden="true"/> ملخص لونا الخاص <ChevronDown size={16} aria-hidden="true"/></summary>
        <dl>
          <div><dt>إشراك الأهل</dt><dd>{value.family && (value.clarifications?.family && conflicts.includes('family') ? readinessClarifications.family.options[value.clarifications.family] : readinessScenarios.family.options[value.family])}</dd></div>
          <div><dt>خطوتك القادمة</dt><dd>{value.nextStep && (value.clarifications?.nextStep && conflicts.includes('nextStep') ? readinessClarifications.nextStep.options[value.clarifications.nextStep] : readinessScenarios.nextStep.options[value.nextStep])}</dd></div>
        </dl>
        {value.nextStep === 'not_yet' && <p>خلّ وقت الخطوة الرسمية موضوعًا واضحًا بينكما إذا بدأ التواصل.</p>}
      </details>
    </MotionReveal>}
    <div className="nf-readiness-card nf-readiness-agreement">
      <h3><ShieldCheck size={18} aria-hidden="true"/> اتفاق العضوية</h3>
      <ul>
        <li>أستخدم وُدَين للتعارف الجاد بقصد الزواج.</li>
        <li>أحترم حدود التواصل وخصوصية الصور والمعلومات.</li>
        <li>أتفق مع الطرف الآخر على التوقيت وإشراك الأهل قبل الانتقال للخطوة الرسمية.</li>
      </ul>
      <label><input type="checkbox" checked={value.agreement === membershipAgreementVersion} onChange={event => onChange({ ...value, agreement: event.target.checked ? membershipAgreementVersion : undefined })}/> أوافق على اتفاق العضوية</label>
    </div>
  </section>;
}
