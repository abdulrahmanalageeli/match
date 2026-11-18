import { useState } from 'react';

export function TestingTrial({busy, accept}: {busy: boolean; accept: () => void}) {
  const [agreed, setAgreed] = useState(false);
  return <section className="nf-testing-trial" dir="rtl" aria-label="التجربة المجانية">
    <h2>جرّب العضوية مجانًا لمدة سبعة أيام</h2>
    <p>تتاح التجربة مرة واحدة لكل رقم جوال مؤكّد. لا تتطلب بطاقة وتنتهي دون خصم أو تجديد تلقائي.</p>
    <label><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)}/> أوافق على بدء التجربة الآن.</label>
    <button className="f-primary" disabled={!agreed || busy} onClick={accept}>ابدأ تجربتي المجانية</button>
  </section>;
}
