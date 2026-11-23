import type { RegistrationChoices } from '../auth/signupReturn';
import './consent.css';

const choices = {
  sensitiveProfile: ['أوافق على استخدام تفاصيلي الحساسة للتوافق', 'درجة بشرتي وما أذكره عن القبيلة والمذهب والممارسة الدينية، وتفضيلاتي المتصلة بها.'],
  assessment: ['أوافق على تحليل إجاباتي للتوافق', 'تستخدم لونا OpenAI لاقتراح إجابات من رسائلي. أراجعها قبل حساب التوافق.'],
} as const;

export function RegistrationAgreements({ value, change, onPrivacy, disabled = false }: {
  value: RegistrationChoices; change: (next: RegistrationChoices) => void; onPrivacy: () => void; disabled?: boolean;
}) {
  function choice(key: keyof typeof choices) {
    const [title, detail] = choices[key];
    return <label className="nf-consent-choice" key={key}>
      <input type="checkbox" required checked={value[key]} onChange={event => change({ ...value, [key]: event.target.checked })}/>
      <span><strong>{title}</strong><small>{detail}</small></span>
    </label>;
  }
  return <fieldset className="nf-consent-review wd-entry-agreements" disabled={disabled}>
    <legend>اتفاق العضوية</legend>
    <div className="wd-entry-required">
      <label className="nf-consent-choice"><input type="checkbox" required checked={value.adult && value.terms && value.privacy}
        onChange={event => change({...value,adult:event.target.checked,terms:event.target.checked,privacy:event.target.checked})}/>
        <span><strong>عمري ١٨ عامًا فأكثر وأسجّل لنفسي بقصد الزواج</strong><small>أوافق على شروط العضوية واطّلعت على إشعار الخصوصية.</small></span>
      </label>
      {choice('sensitiveProfile')}
      {choice('assessment')}
    </div>
    <button type="button" className="nf-privacy-link wd-entry-legal" onClick={onPrivacy}>شروط الاستخدام وإشعار الخصوصية</button>
  </fieldset>;
}
