import { ChevronDown } from 'lucide-react';
import type { RegistrationChoices } from '../auth/signupReturn';
import './consent.css';

const choices = {
  sensitiveProfile: ['أوافق على استخدام تفاصيلي الحساسة للتوافق', 'درجة بشرتي وما أذكره عن القبيلة والمذهب والممارسة الدينية، وتفضيلاتي المتصلة بها.'],
  assessment: ['أوافق على تحليل إجاباتي للتوافق', 'تستخدم لونا OpenAI لاقتراح إجابات من رسائلي. أراجعها قبل حساب التوافق.'],
  sensitivePublication: ['إظهار تفاصيلي الحساسة في ملفي', 'يرى الأعضاء المؤهلون التفاصيل التي أدخلها وصورتي الرمزية. تبقى تفضيلاتي للشريك خاصة.'],
  photo: ['عرض صورتي في ملفي', 'تظهر الصورة التي أضيفها للأعضاء المؤهلين وفق إعدادات العرض التي أختارها.'],
  transcript: ['السماح لفريق العضوية بمراجعة حواري مع لونا', 'يمكن لمراجع مخوّل قراءة رسائلي وردود لونا في الجلسات الجديدة. يُسجَّل سبب الاطلاع، ويُحذف الحوار بعد ٣٠ يومًا من آخر تعديل. يمكنني سحب الإذن.'],
  safetyTextReview: ['السماح بفرز رسالة أرسلها إذا أُبلغ عنها', 'إذا طلب المُبلّغ ذلك، يُرسل مقتطف من الرسالة إلى OpenAI بعد حجب بيانات التواصل لتحديد أولوية المراجعة. القرار للفريق، ويمكنني سحب الإذن.'],
} as const;

export function RegistrationAgreements({ value, change, onPrivacy, disabled = false }: {
  value: RegistrationChoices; change: (next: RegistrationChoices) => void; onPrivacy: () => void; disabled?: boolean;
}) {
  function choice(key: keyof typeof choices) {
    const [title, detail] = choices[key];
    return <label className="nf-consent-choice" key={key}>
      <input type="checkbox" checked={value[key]} onChange={event => change({ ...value, [key]: event.target.checked })}/>
      <span><strong>{title}</strong><small>{detail}</small></span>
    </label>;
  }
  return <fieldset className="nf-consent-review wd-entry-agreements" disabled={disabled}>
    <legend>اتفاق العضوية</legend>
    <div className="wd-entry-required">
      <label className="nf-consent-choice"><input type="checkbox" checked={value.adult && value.terms && value.privacy}
        onChange={event => change({...value,adult:event.target.checked,terms:event.target.checked,privacy:event.target.checked})}/>
        <span><strong>عمري ١٨ عامًا فأكثر وأسجّل لنفسي بقصد الزواج</strong><small>أوافق على شروط العضوية واطّلعت على إشعار الخصوصية.</small></span>
      </label>
      {choice('sensitiveProfile')}
      {choice('assessment')}
    </div>
    <details className="wd-entry-optional">
      <summary>أذونات اختيارية للملف والمراجعة<ChevronDown size={16} aria-hidden="true"/></summary>
      {choice('sensitivePublication')}
      {choice('photo')}
      {choice('transcript')}
      {choice('safetyTextReview')}
    </details>
    <button type="button" className="nf-privacy-link wd-entry-legal" onClick={onPrivacy}>شروط الاستخدام وإشعار الخصوصية</button>
  </fieldset>;
}
