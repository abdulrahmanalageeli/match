import { useId } from 'react';
import type { Answers } from './draft';

export function MemberNameFields({ answers, update, required }: {
  answers: Answers; update: (patch: Partial<Answers>) => void; required: boolean;
}) {
  const privacyNote = useId();
  return <div className="nf-member-names" role="group" aria-label="الأسماء" aria-describedby={privacyNote}>
    <div className="nf-name-rows">
      <label>الاسم الأول
        <input data-field="firstName" autoComplete="given-name" dir="auto" placeholder="مثل سارة"
          maxLength={60} required={required} value={answers.firstName ?? ''} onChange={e => update({ firstName: e.target.value })}/>
      </label>
      <label>اسم العائلة
        <input data-field="lastName" autoComplete="family-name" dir="auto" placeholder="مثل الناصر"
          maxLength={60} required={required} value={answers.lastName ?? ''} onChange={e => update({ lastName: e.target.value })}/>
      </label>
      <label>الاسم المستعار
        <input data-field="displayName" autoComplete="nickname" dir="auto" placeholder="مثل ورد"
          maxLength={60} required value={answers.displayName} onChange={e => update({ displayName: e.target.value })}/>
      </label>
    </div>
    <p id={privacyNote}>يظهر للأعضاء اسمك المستعار فقط.</p>
  </div>;
}
