import type { RegistrationChoices } from '../auth/signupReturn';
import './consent.css';

const choices: Record<Exclude<keyof RegistrationChoices, 'adult'|'terms'|'privacy'>, [string, string]> = {
  sensitiveProfile: ['أوافق على معالجة تفاصيل ملفي الحساسة', 'تُستخدم درجة البشرة وما أذكره عن الخلفية القبلية والمذهب والممارسة الدينية، وتفضيلاتي ذات الصلة، لإعداد ملفي والتوافق.'],
  sensitivePublication: ['أختار إظهار تفاصيل ملفي الحساسة · اختياري', 'يرى الأعضاء المؤهلون ما أدخله من هذه التفاصيل وصورتي الرمزية. تبقى تفضيلاتي للشريك خاصة.'],
  assessment: ['أوافق على تحليل إجاباتي للتوافق', 'تعالج لونا رسائلي عبر OpenAI لاقتراح إجابات أراجعها، وتُستخدم اختياراتي في حساب التوافق.'],
  safetyTextReview: ['أسمح بفرز رسالة أرسلها إذا أُبلغ عنها · اختياري', 'إذا اختار المُبلّغ ذلك، يمكن إرسال مقتطف من رسالتي وحدها إلى OpenAI لتحديد أولوية المراجعة بعد حجب وسائل التواصل. القرار للفريق، ويمكنني سحب الإذن.'],
  photo: ['أوافق على عرض صورة أضيفها إلى ملفي', 'تُعرض للأعضاء المؤهلين وفق إعدادات الصورة التي أختارها. يُطلب إذن التحقّق بالكاميرا عند استخدامه.'],
  transcript: ['أوافق على مراجعة حواري مع لونا لطلب العضوية', 'يُحفظ الحوار المرسل ٣٠ يومًا من آخر تعديل. يفتحه مراجع مخوّل عند الحاجة، ويُسجّل سبب الاطلاع. يمكنني حذف الجلسة.'],
};

export function RegistrationAgreements({ value, change, onPrivacy, disabled = false }: {
  value: RegistrationChoices; change: (next: RegistrationChoices) => void; onPrivacy: () => void; disabled?: boolean;
}) {
  return <fieldset className="nf-consent-review wd-entry-agreements" disabled={disabled}>
    <legend>قبل إنشاء ملفك</legend>
    <label className="nf-consent-choice"><input type="checkbox" checked={value.adult && value.terms && value.privacy}
      onChange={event => change({...value,adult:event.target.checked,terms:event.target.checked,privacy:event.target.checked})}/>
      <span><strong>عمري ١٨ عامًا فأكثر وأوافق على شروط العضوية</strong><small>اطّلعت على الخصوصية وأستخدم الحساب لنفسي بقصد الزواج. أختار من أقابله وأحمي بياناتي وأموالي.</small></span>
    </label>
    <p>إذا أبلغت عن إساءة داخل وُدَين، يراجع الفريق الرسالة التي تحدّدها. تختار وقت الإبلاغ إن كنت تريد فرزها آليًا. يمكنك إبلاغ الجهات المختصة عن الاحتيال.</p>
    {(['sensitiveProfile','assessment','transcript','sensitivePublication','photo','safetyTextReview'] as const).map(key => <label className="nf-consent-choice" key={key}>
      <input type="checkbox" checked={value[key]} onChange={event => change({ ...value, [key]: event.target.checked })}/>
      <span><strong>{choices[key][0]}</strong><small>{choices[key][1]}</small></span>
    </label>)}
    <button type="button" className="nf-privacy-link" onClick={onPrivacy}>شروط الاستخدام وإشعار الخصوصية</button>
  </fieldset>;
}
