import {useState} from 'react';
import {BrandWordmark} from './Brand';
import {WhyWudayn} from './WhyWudayn';
import {membershipPriceLabel} from './membershipPricing';

export function TestingTrial({busy,expiresAt,accept,back,gender}:{busy:boolean;expiresAt?:string|null;accept:()=>void;back:()=>void;gender?:'man'|'woman'}) {
 const [agreed,setAgreed]=useState(false);
 const expired=Boolean(expiresAt&&Date.parse(expiresAt)<=Date.now());
 const activated=Boolean(expiresAt);
 return <section className="nf-testing-trial" dir="rtl">
  <BrandWordmark/>
  <span className="nf-demo-tag">تجربة مجانية · بدون بطاقة</span>
  <h1>{expired?'اكتملت تجربتك':activated?'تجربتك المجانية مفعّلة':'أسبوع لتعرف قيمة وُدَين لك'}</h1>
  <p>{expired?'حسابك وبياناتك محفوظة. يمكنك العودة إلى ملفك أو التواصل مع الدعم.':'جرّب جودة الترشيحات ووضوح التوافق قبل أن تقرر إن كانت العضوية تستحق.'}</p>
  <div className="nf-testing-offer"><strong>٧ أيام مجانًا</strong><span>الاشتراك لاحقًا: {membershipPriceLabel(gender)} / شهر</span></div>
  <ol className="nf-trial-steps" aria-label="ما الذي تجرّبه خلال الأسبوع؟">
   <li><strong>افهم الترشيح</strong><span>اقرأ الملف كاملًا، ثم نقاط الاتفاق وما يحتاج حوارًا. النسبة ليست وعدًا بنجاح الزواج.</span></li>
   <li><strong>اختر بداية مناسبة</strong><span>أرسل طلبًا لمن يناسبك. بعد القبول المتبادل وإقرار الجدّية تبدأ المحادثة.</span></li>
   <li><strong>قيّم تجربتك بنفسك</strong><span>هل وجدت ملفات مناسبة وحوارًا يستحق المتابعة؟ عدد الترشيحات والردود غير مضمون.</span></li>
  </ol>
  <p className="nf-trial-pilot-note">تتضمن التجربة ملفات خيالية موسومة بأنها توضيحية؛ وجودها لا يعني وجود أعضاء حقيقيين متاحين للتعارف.</p>
  <WhyWudayn label="ما الذي تحصل عليه في وُدَين؟"/>
  <p>لا نطلب بطاقة، ولن يُخصم أي مبلغ أو يبدأ اشتراك مدفوع تلقائيًا. تنتهي التجربة المجانية بعد أسبوع، وأي اشتراك لاحق يتطلب موافقتك قبل الشراء.</p>
  {activated&&<p>تنتهي التجربة في {new Date(expiresAt!).toLocaleDateString('ar-SA',{calendar:'gregory'})}، دون أي خصم.</p>}
  {!activated&&<><label><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/> فهمت العرض وأوافق على بدء التجربة المجانية.</label>
  <button className="f-primary" disabled={!agreed||busy} onClick={accept}>{busy?'جارٍ تفعيل التجربة…':'ابدأ تجربتي المجانية'}</button></>}
  <button className="f-secondary" onClick={back}>العودة إلى حسابي</button>
 </section>;
}
