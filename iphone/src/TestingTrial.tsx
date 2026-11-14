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
  <h1>{expired?'اكتملت تجربتك':activated?'تجربتك المجانية مفعّلة':'خذ وقتك لتجد من يناسبك'}</h1>
  <p>{expired?'حسابك وبياناتك محفوظة. يمكنك العودة إلى ملفك أو التواصل مع الدعم.':'أكمل ملفك، استكشف الأعضاء، وابدأ تعارفًا جادًا بخطوات واضحة.'}</p>
  <div className="nf-testing-offer"><strong>٧ أيام مجانًا</strong><span>الاشتراك لاحقًا: {membershipPriceLabel(gender)} / شهر</span></div>
  <ul className="wd-membership-benefits"><li>توافق مُفسّر، ونقاط اتفاق تستحق البداية</li><li>اتفاق جدّية وموعد لخطوتكما المقبلة</li><li>تعارف حصري بموافقتكما، وجسر آمن للأهل</li></ul>
  <WhyWudayn label="ما الذي تحصل عليه في وُدَين؟"/>
  <p>لا نطلب بطاقة، ولن يُخصم أي مبلغ أو يبدأ اشتراك مدفوع تلقائيًا. تنتهي التجربة المجانية بعد أسبوع، وأي اشتراك لاحق يتطلب موافقتك قبل الشراء.</p>
  {activated&&<p>تنتهي التجربة في {new Date(expiresAt!).toLocaleDateString('ar-SA',{calendar:'gregory'})}، دون أي خصم.</p>}
  {!activated&&<><label><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/> فهمت العرض وأوافق على بدء التجربة المجانية.</label>
  <button className="f-primary" disabled={!agreed||busy} onClick={accept}>{busy?'جارٍ تفعيل التجربة…':'ابدأ تجربتي المجانية'}</button></>}
  <button className="f-secondary" onClick={back}>العودة إلى حسابي</button>
 </section>;
}
