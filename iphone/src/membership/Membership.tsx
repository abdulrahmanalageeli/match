import {useEffect,useState} from 'react';
import {getMembershipOffer,type MembershipOffer} from '../billing';
import {seriousnessPriceLabel,type MembershipPlan} from '../membershipPricing';
import {Check} from '../BrandIcons';
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
 'التوافقات في نفس الوقت':'ارتباط واحد للمجاني، واثنان للمميز، وثلاثة لوسام الجدية في الوقت نفسه. الحصرية تقتصر على شخص واحد، وتبقى الارتباطات القائمة عند انتهاء الاشتراك.',
 'قراءة التوافق':'شاهد نسب التوافق في جميع الملفات المؤهلة. تتاح قراءة التوافق للمجاني في ثلاثة ترشيحات عشوائية. قراءة التوافق ليست ضمانًا لنجاح الزواج.',
 'نقاط الاتفاق والاختلاف':'تعمّق في تفاصيل تفضيلاتكما، وما يجمعكما والموضوعات التي تستحق نقاشًا قبل اتخاذ الخطوة التالية.',
 'التصفية بنسبة التوافق':'حدد الحد الأدنى لنسبة توافق التفضيلات في فلاتر الاستكشاف، لتظهر الملفات المكتملة التي تحقق النسبة التي اخترتها.',
 'قبول الطلبات والتواصل':'تشمل قبول طلبات التعارف، والمحادثات، وميثاق التعارف، والمكالمات الصوتية داخل التطبيق. يبدأ التواصل بعد القبول واتفاق الطرفين على الميثاق، والمكالمات بموافقة الطرف الآخر.',
 'أسئلة حديث حسب توافقكما':'اقتراحات لبدء الحديث مرتبطة بقراءة توافقكما. تبقى بدايات الحديث العامة متاحة للجميع.',
 'شارة العضوية المميزة':'تظهر بجانب اسمك لتوضح اشتراكك في وُدَين المميزة، ولا تعني توثيق الهوية.',
 'الالتزام الحصري وجسر الأهل':'التركيز على شخص واحد بموافقتكما، ثم تنسيق الخطوة العائلية في المرحلة المناسبة مع الحفاظ على الخصوصية. الحصرية تغلق التعارفات الأخرى وتوقف الطلبات الجديدة.',
 'الالتزام الحصري':'اختيار متبادل للتركيز على شخص واحد بعد بدء التعارف. يتفعّل بموافقتكما، ويغلق التعارفات الأخرى ويوقف الطلبات الجديدة. يمكنك إنهاؤه في أي وقت.',
 'جسر الأهل':'تنسيق الخطوة العائلية بموافقة الطرفين وبالمرحلة المناسبة في مسار التعارف، مع الحفاظ على خصوصية التواصل.',
 'المكالمات الصوتية':'مكالمات داخل التطبيق بعد القبول واتفاق التواصل، وبموافقة الطرف الآخر.',
 'ميثاق التعارف':'اتفاق بينكما على أسلوب التواصل والحدود قبل بدء الحديث. قبول طلب التعارف وحده لا يفعّل المحادثة.',
};
export function Membership({back,active,demo,price,canStart,canBuy,busy,buy,restore,manage,refresh,expiry,onPolicy,
 gender,trialEligible=false,currency,currentTier,loadOffer=getMembershipOffer}: {
 back:Click;active:boolean;demo:boolean;price:string|null;canStart:boolean;canBuy:boolean;busy:boolean;
 buy:(plan?:MembershipPlan,offer?:MembershipOffer)=>void;restore:Click;manage:Click;refresh:Click;expiry:string|null;onPolicy:Click;
 gender?:'man'|'woman';trialEligible?:boolean;currency?:string;currentTier?:'free'|'premium'|'seriousness';loadOffer?:typeof getMembershipOffer;
}) {
 const [plan,setPlan]=useState<'premium'|'seriousness'>(currentTier==='seriousness'?'seriousness':'premium');
 const seriousness=plan==='seriousness';
 const upgrading=active&&currentTier==='premium'&&seriousness;
 const managing=active&&!upgrading;
 const [seriousOffer,setSeriousOffer]=useState<MembershipOffer|null>(null);
 const [offerError,setOfferError]=useState(false);
 useEffect(()=>{if(!seriousness||!canBuy||demo)return;let cancelled=false;setSeriousOffer(null);setOfferError(false);loadOffer(gender,'seriousness').then(offer=>{if(!cancelled)setSeriousOffer(offer)}).catch(()=>{if(!cancelled)setOfferError(true)});return()=>{cancelled=true}},[seriousness,canBuy,demo,gender,loadOffer]);
 const selectedPrice=seriousness?(demo?seriousnessPriceLabel(gender):seriousOffer?.price??null):price;
 const trial=!seriousness&&!active&&!demo&&Boolean(price)&&trialEligible;
 const until=expiry?new Date(expiry):null;
 return <Frame title="عضوية وُدَين" back={back} className="wd-paywall" headerAction={<img className="wd-header-logo" src="/brand/wudayn-emblem-v2.png" width="30" height="30" alt="شعار وُدَين"/>}>
  <table className="wd-tier-comparison" aria-label="مقارنة العضوية المجانية والمميزة ووسام الجدية">
   <thead><tr><th scope="col">مزايا عضويتك</th><th scope="col">مجانية</th><th scope="col">مميزة</th><th scope="col" className="wd-seriousness-heading">وسام الجدية</th></tr></thead>
   <tbody>
    <tr className="wd-connection-counts"><th scope="row">التوافقات في نفس الوقت<BenefitInfo label="التوافقات في نفس الوقت">{benefitExplanations['التوافقات في نفس الوقت']}</BenefitInfo></th><td>١</td><td>٢</td><td>٣</td></tr>
    <tr><th scope="row">أولوية الظهور<BenefitInfo label="أولوية الظهور">فرصة ظهور أعلى ضمن التفضيلات وشروط الظهور المتبادلة، دون تغيير نسب التوافق أو ضمان عدد مشاهدات.</BenefitInfo></th><td><span aria-label="غير متاح">—</span></td><td><span aria-label="غير متاح">—</span></td><td><span role="img" aria-label="متاح"><Check size={15}/></span></td></tr>
    <tr><th scope="row">البحث مع لونا<BenefitInfo label="البحث مع لونا">صف تفضيلاتك حتى ٦٠٠ حرف. تفهم لونا طلبك وتبحث في جميع الملفات المؤهلة للظهور، وترتبها حسب مطابقة الوصف والتوافق. حتى ٣٠ بحثًا يوميًا.</BenefitInfo></th><td>—</td><td>—</td><td><span role="img" aria-label="متاح"><Check size={15}/></span></td></tr>
    <tr><th scope="row">تحليل وُدَين المعمّق<BenefitInfo label="تحليل وُدَين المعمّق">طلب تقرير مشترك من إجاباتكما المحفوظة، دون استبيان إضافي. يبدأ بموافقة الطرفين، وتراجعان الإفصاحات قبل مشاركتها. استقبال الطلب وقراءة التقرير متاحان للطرف الآخر بأي عضوية.</BenefitInfo></th><td>—</td><td>—</td><td><span role="img" aria-label="متاح"><Check size={15}/></span></td></tr>
    {[
     ['إرسال طلبات التعارف',false],
     ['نقاط الاتفاق والاختلاف',false],
     ['التصفية بنسبة التوافق',false],
     ['أسئلة حديث حسب توافقكما',false],
     ['شارة العضوية المميزة',false],
     ['قراءة التوافق','٣ ترشيحات'],
     ['جلسة لونا واستكشاف الملفات',true],
     ['إبداء الاهتمام بالملفات',true],
     ['قبول الطلبات والتواصل',true],
     ['الالتزام الحصري وجسر الأهل',true],
    ].map(([label,free])=><tr key={String(label)} data-shared-start={label==='جلسة لونا واستكشاف الملفات'||undefined}>
     <th scope="row">{label}{benefitExplanations[String(label)]&&<BenefitInfo label={String(label)}>{benefitExplanations[String(label)]}</BenefitInfo>}</th>
     <td>{typeof free==='string'?free:free?<span role="img" aria-label="متاح"><Check size={14}/></span>:<span aria-label="غير متاح">—</span>}</td>
     <td>{label==='قراءة التوافق'?'كل الملفات':label==='التوافقات في نفس الوقت'?'٢':label==='شارة العضوية المميزة'?<img className="wd-seriousness-seal" src="/brand/wudayn-member-seal.png" alt="عضوية وُدَين المميزة"/>:<span role="img" aria-label="متاح"><Check size={15}/></span>}</td>
     <td>{label==='قراءة التوافق'?'كل الملفات':label==='التوافقات في نفس الوقت'?'٣':label==='شارة العضوية المميزة'?<img className="wd-seriousness-seal" src="/brand/wudayn-seriousness-seal.png" alt="وسام الجدية"/>:<span role="img" aria-label="متاح"><Check size={15}/></span>}</td>
    </tr>)}

   </tbody>
  </table>
  {(!active||currentTier==='premium')&&<div className="wd-plan-choice" role="group" aria-label="اختر عضويتك"><button type="button" aria-pressed={!seriousness} onClick={()=>setPlan('premium')}><img src="/brand/wudayn-member-seal.png" alt=""/><span>المميزة<small>{price??'السعر من Apple'}</small></span></button><button type="button" aria-pressed={seriousness} onClick={()=>setPlan('seriousness')}><img src="/brand/wudayn-seriousness-seal.png" alt=""/><span>وسام الجدية<small>{seriousnessPriceLabel(gender)}</small></span></button></div>}
  <section className="wd-membership-card" aria-label="تفاصيل العضوية والسعر">
   {trial&&<div className="wd-trial-highlight"><strong>٧ أيام مجانًا</strong><span className="wd-trial-limit"><span>عرض إطلاق محدود</span><b><span>لأول ٥٠ امرأة</span><span>و٥٠ رجلًا</span></b></span></div>}
   <span className="wd-price-spark" aria-hidden="true"/>
   {Array.from({length:24},(_,index)=><span key={index} className="wd-price-spark-tail" aria-hidden="true" style={{animationDelay:`${-9+(index+1)*.01875}s`,opacity:Math.pow(1-index/24,1.7)*.65,color:`hsl(${36-index*61/23} ${60-index*20/23}% ${85-index*25/23}%)`}}/>)}
   <svg className="wd-price-orbit" width="100%" height="100%" aria-hidden="true" focusable="false"><rect className="wd-price-orbit-trail" x="1" y="1" rx="18" pathLength="100"/><rect className="wd-price-orbit-glow" x="1" y="1" rx="18" pathLength="100"/><rect className="wd-price-orbit-tip" x="1" y="1" rx="18" pathLength="100"/></svg>
   <div className="wd-plan-top"><strong>{seriousness?'وسام الجدية':'وُدَين المميزة'}</strong>{!active&&!seriousness&&<span>{gender==='woman'?'سعر خاص للنساء':'عرض الإطلاق'}</span>}</div>
   <div className="wd-price-row"><strong>{managing?'عضوية فعّالة':selectedPrice??'السعر من App Store'}</strong>{!managing&&selectedPrice&&<small>/ شهريًا</small>}
   </div>
   {active&&<p className="wd-price-context">راجع سعر التجديد وموعده في اشتراكات Apple.</p>}
  </section>
  {active&&until&&!isNaN(until.getTime())&&<p className="wd-billing-note">عضويتك سارية حتى {until.toLocaleDateString('ar-SA',{calendar:'gregory',dateStyle:'long'})}.</p>}
  {!managing&&<p className="wd-billing-note">{trial?`٧ أيام مجانًا، ثم ${price} شهريًا بتجديد تلقائي عبر Apple. ألغِ قبل نهاية التجربة بـ٢٤ ساعة لتجنب الخصم.`:`${selectedPrice?selectedPrice+' شهريًا. ':''}تجديد تلقائي عبر Apple حتى الإلغاء.`}</p>}
  {seriousness&&offerError&&<p className="wd-billing-note" role="status">تعذّر تحميل وسام الجدية من Apple. اختر المميزة أو أعد اختيار وسام الجدية للمحاولة.</p>}
  {demo?<button className="f-primary wd-purchase" onClick={back}>العودة للتجربة</button>:managing?<button className="f-primary wd-purchase" disabled={!canBuy||busy} onClick={manage}>إدارة الاشتراك في Apple</button>:<button className="f-primary wd-purchase" disabled={(!canStart&&!upgrading)||!canBuy||!selectedPrice||busy} onClick={()=>buy(plan,seriousness?seriousOffer??undefined:undefined)}>{busy?'جارٍ المتابعة…':trial?'ابدأ أسبوعك المجاني':seriousness?'اشترك في وسام الجدية':'انضم إلى وُدَين المميزة'}</button>}
  {!active&&!demo&&<button className="f-link wd-continue" onClick={back}>المتابعة مجانًا</button>}
  {!canBuy&&!demo&&<p className="wd-billing-note">الاشتراك متاح من تطبيق وُدَين على iPhone.</p>}
  {!active&&(!canStart||!price)&&<button className="f-link centered" disabled={busy} onClick={refresh}>تحديث عرض العضوية</button>}
  {!active&&!canStart&&<p className="flow-note">الاشتراك متاح بعد اعتماد ملفك وتوفر ترشيحات مناسبة. يمكنك متابعة حسابك مجانًا.</p>}
  <div className="wd-actions">{!demo&&<button className="f-link" disabled={busy||!canBuy} onClick={restore}>استعادة المشتريات</button>}<button className="f-link" onClick={onPolicy}>الشروط والخصوصية</button></div>
 </Frame>;
}
