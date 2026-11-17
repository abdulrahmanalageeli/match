import {Check} from '../BrandIcons';
import {MemberBadge} from './MemberBadge';
import {Frame} from '../Screens';
import './membership.css';

type Click=()=>void;
function BenefitInfo({label,children}:{label:string;children:string}) {
 return <details className="wd-benefit-info" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))event.currentTarget.open=false;}}>
  <summary aria-label={`توضيح ${label}`}><img className="wd-info-mark" src="/brand/wudayn-guide-info-cursive.png" width="14" height="14" alt=""/></summary>
  <span className="wd-benefit-tooltip" role="note"><strong>{label}</strong>{children}</span>
 </details>;
}
const benefitExplanations:Record<string,string>={
 'التوافقات في نفس الوقت':'ارتباط واحد للمجاني وثلاثة للمميز في الوقت نفسه. الحصرية تقتصر على شخص واحد، وتبقى الارتباطات القائمة عند انتهاء الاشتراك.',
 'قراءة التوافق':'شاهد نسب التوافق في جميع الملفات المؤهلة. تبقى نسب الترشيحات متاحة للمجاني. قراءة التوافق ليست ضمانًا لنجاح الزواج.',
 'نقاط الاتفاق والاختلاف':'تعمّق في تفاصيل تفضيلاتكما، وما يجمعكما والموضوعات التي تستحق نقاشًا قبل اتخاذ الخطوة التالية.',
 'التصفية بنسبة التوافق':'حدد الحد الأدنى لنسبة توافق التفضيلات في فلاتر الاستكشاف، لتظهر الملفات المكتملة التي تحقق النسبة التي اخترتها.',
 'قبول الطلبات والتواصل':'تشمل قبول طلبات التعارف، والمحادثات، وميثاق التعارف، والمكالمات الصوتية داخل التطبيق. يبدأ التواصل بعد القبول واتفاق الطرفين على الميثاق، والمكالمات بموافقة الطرف الآخر.',
 'أسئلة حديث حسب توافقكما':'اقتراحات لبدء الحديث مرتبطة بقراءة توافقكما. تبقى بدايات الحديث العامة متاحة للجميع.',
 'شارة العضوية المميزة':'تظهر بجانب اسمك لتوضح اشتراكك في وُدَين المميزة، ولا تعني توثيق الهوية.',
 'الالتزام الحصري':'اختيار متبادل للتركيز على شخص واحد بعد بدء التعارف. يتفعّل بموافقتكما، ويغلق التعارفات الأخرى ويوقف الطلبات الجديدة. يمكنك إنهاؤه في أي وقت.',
 'جسر الأهل':'تنسيق الخطوة العائلية بموافقة الطرفين وبالمرحلة المناسبة في مسار التعارف، مع الحفاظ على خصوصية التواصل.',
 'المكالمات الصوتية':'مكالمات داخل التطبيق بعد القبول واتفاق التواصل، وبموافقة الطرف الآخر.',
 'ميثاق التعارف':'اتفاق بينكما على أسلوب التواصل والحدود قبل بدء الحديث. قبول طلب التعارف وحده لا يفعّل المحادثة.',
};
export function Membership({back,active,demo,price,canStart,canBuy,busy,buy,restore,manage,refresh,expiry,onPolicy,
 gender,trialEligible=false,currency}: {
 back:Click;active:boolean;demo:boolean;price:string|null;canStart:boolean;canBuy:boolean;busy:boolean;
 buy:Click;restore:Click;manage:Click;refresh:Click;expiry:string|null;onPolicy:Click;
 gender?:'man'|'woman';trialEligible?:boolean;currency?:string;
}) {
 const trial=!active&&!demo&&Boolean(price)&&trialEligible;
 const until=expiry?new Date(expiry):null;
 return <Frame title="عضوية وُدَين" back={back} className="wd-paywall" headerAction={<img className="wd-header-logo" src="/brand/wudayn-emblem-v2.png" width="30" height="30" alt="شعار وُدَين"/>}>
  {active&&<header className="wd-paywall-intro"><h1>خطوتك الجادّة، بمزايا أكثر</h1></header>}
  <table className="wd-tier-comparison" aria-label="مقارنة العضوية المجانية والمميزة">
   <thead><tr><th scope="col">مزايا عضويتك</th><th scope="col">مجانية</th><th scope="col">مميزة</th></tr></thead>
   <tbody>
    {[
     ['التوافقات في نفس الوقت','١'],
     ['إرسال طلبات التعارف',false],
     ['قراءة التوافق',false],
     ['نقاط الاتفاق والاختلاف',false],
     ['التصفية بنسبة التوافق',false],
     ['أسئلة حديث حسب توافقكما',false],
     ['شارة العضوية المميزة',false],
     ['جلسة لونا واستكشاف الملفات',true],
     ['إبداء الاهتمام بالملفات',true],
     ['قبول الطلبات والتواصل',true],
     ['الالتزام الحصري',true],
     ['جسر الأهل',true],
    ].map(([label,free])=><tr key={String(label)} data-shared-start={label==='جلسة لونا واستكشاف الملفات'||undefined}>
     <th scope="row">{label==='شارة العضوية المميزة'&&<MemberBadge active/>}{label}{benefitExplanations[String(label)]&&<BenefitInfo label={String(label)}>{benefitExplanations[String(label)]}</BenefitInfo>}</th>
     <td>{typeof free==='string'?free:free?<span role="img" aria-label="متاح"><Check size={14}/></span>:<span aria-label="غير متاح">—</span>}</td>
     <td>{label==='قراءة التوافق'?'جميع الملفات':label==='التوافقات في نفس الوقت'?'٣':<span role="img" aria-label="متاح"><Check size={15}/></span>}</td>
    </tr>)}
   </tbody>
  </table>
  <section className="wd-membership-card" aria-label="تفاصيل العضوية والسعر">
   {trial&&<div className="wd-trial-highlight"><strong>٧ أيام مجانًا</strong><span>عرض الإطلاق<br/>لأول <b>٥٠ امرأة</b> و<b>٥٠ رجلًا</b> مؤهلين</span></div>}
   <span className="wd-price-spark" aria-hidden="true"/>
   {Array.from({length:24},(_,index)=><span key={index} className="wd-price-spark-tail" aria-hidden="true" style={{animationDelay:`${-9+(index+1)*.01875}s`,opacity:Math.pow(1-index/24,1.7)*.65,color:`hsl(${36-index*61/23} ${60-index*20/23}% ${85-index*25/23}%)`}}/>)}
   <svg className="wd-price-orbit" width="100%" height="100%" aria-hidden="true" focusable="false"><rect className="wd-price-orbit-trail" x="1" y="1" rx="18" pathLength="100"/><rect className="wd-price-orbit-glow" x="1" y="1" rx="18" pathLength="100"/><rect className="wd-price-orbit-tip" x="1" y="1" rx="18" pathLength="100"/></svg>
   <div className="wd-plan-top"><strong>وُدَين المميزة</strong>{!active&&<span>{gender==='woman'?'سعر خاص للنساء':'عرض الإطلاق'}</span>}</div>
   <div className="wd-price-row"><strong>{active?'عضوية فعّالة':price??'السعر من App Store'}</strong>{!active&&price&&<small>/ شهريًا</small>}
   </div>
   {active&&<p className="wd-price-context">راجع سعر التجديد وموعده في اشتراكات Apple.</p>}
  </section>
  {active&&until&&!isNaN(until.getTime())&&<p className="wd-billing-note">عضويتك سارية حتى {until.toLocaleDateString('ar-SA',{calendar:'gregory',dateStyle:'long'})}.</p>}
  {!active&&<p className="wd-billing-note">{trial?`٧ أيام مجانًا، ثم ${price} شهريًا بتجديد تلقائي عبر Apple. ألغِ قبل نهاية التجربة بـ٢٤ ساعة لتجنب الخصم.`:`${price?price+' شهريًا. ':''}تجديد تلقائي عبر Apple حتى الإلغاء.`}</p>}
  {demo?<button className="f-primary wd-purchase" onClick={back}>العودة للتجربة</button>:active?<button className="f-primary wd-purchase" disabled={!canBuy||busy} onClick={manage}>إدارة الاشتراك في Apple</button>:<button className="f-primary wd-purchase" disabled={!canStart||!canBuy||!price||busy} onClick={buy}>{busy?'جارٍ المتابعة…':trial?'ابدأ أسبوعك المجاني':'انضم إلى وُدَين المميزة'}</button>}
  {!active&&!demo&&<button className="f-link wd-continue" onClick={back}>المتابعة مجانًا</button>}
  {!canBuy&&!demo&&<p className="wd-billing-note">الاشتراك متاح من تطبيق وُدَين على iPhone.</p>}
  {!active&&(!canStart||!price)&&<button className="f-link centered" disabled={busy} onClick={refresh}>تحديث عرض العضوية</button>}
  {!active&&!canStart&&<p className="flow-note">الاشتراك متاح بعد اعتماد ملفك وتوفر ترشيحات مناسبة. يمكنك متابعة حسابك مجانًا.</p>}
  <div className="wd-actions">{!demo&&<button className="f-link" disabled={busy||!canBuy} onClick={restore}>استعادة المشتريات</button>}<button className="f-link" onClick={onPolicy}>الشروط والخصوصية</button></div>
 </Frame>;
}
