import {useEffect,useState} from 'react';
import { launchEvent } from '../launchEvents';
import {getMembershipOffer,type MembershipOffer,type MembershipPromotion} from '../billing';
import {membershipPriceLabel,seriousnessPriceLabel,type MembershipPlan} from '../membershipPricing';
import {Check} from '../BrandIcons';
import {Frame} from '../Screens';
import {TestingTrial} from '../TestingTrial';
import './membership.css';
import './membership-receipt.css';

type Click=()=>void;
function BenefitInfo({label,children}:{label:string;children:string}) {
 return <details className="wd-benefit-info" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))event.currentTarget.open=false;}}>
  <summary aria-label={`توضيح ${label}`}><img className="wd-info-mark" src="/brand/wudayn-guide-info-cursive.png" width="14" height="14" alt=""/></summary>
  <span className="wd-benefit-tooltip" role="note"><strong>{label}</strong>{children}</span>
 </details>;
}
const benefitExplanations:Record<string,string>={
 'التوافقات في نفس الوقت':'ارتباط واحد للمجاني، واثنان للمميز، وثلاثة لوسام الجدية في الوقت نفسه. الحصرية تقتصر على شخص واحد، وتبقى الارتباطات القائمة عند انتهاء الاشتراك.',
 'قراءة التوافق':'شاهد نسب التوافق في جميع الملفات المؤهلة. تتاح قراءة التوافق للمجاني في ثلاثة ترشيحات عشوائية.',
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
export function Membership({back,measurementOwner,initialPlan,active,demo,price,canStart,canBuy,busy,buy,restore,manage,refresh,expiry,onPolicy,priceFailed,sandboxCheckout,offerRevision,
 period,introduction,promotion,giftUntil,status,pilotEligible,startPilot,gender,trialEligible=false,currency,currentTier,loadOffer=getMembershipOffer}: {
 back:Click;measurementOwner?:string;initialPlan?:MembershipPlan;active:boolean;demo:boolean;price:string|null;canStart:boolean;canBuy:boolean;busy:boolean;
 priceFailed?:boolean;sandboxCheckout?:boolean;offerRevision?:number;
 buy:(plan?:MembershipPlan,offer?:MembershipOffer)=>void;restore:Click;manage:Click;refresh:Click;expiry:string|null;onPolicy:Click;
 period?:string;introduction?:string;promotion?:MembershipPromotion;giftUntil?:string|null;status?:'free'|'expired'|'paid'|'granted'|'trial';pilotEligible?:boolean;startPilot?:Click;
 gender?:'man'|'woman';trialEligible?:boolean;currency?:string;currentTier?:'free'|'premium'|'seriousness';loadOffer?:typeof getMembershipOffer;
}) {
 const [selectedPlan,setPlan]=useState<MembershipPlan>(initialPlan??'premium');
 const plan=currentTier==='seriousness'?'seriousness':selectedPlan;
 const seriousness=plan==='seriousness';
 const upgrading=active&&currentTier==='premium'&&seriousness;
 const managing=active&&!upgrading&&status!=='trial';
 const [seriousOffer,setSeriousOffer]=useState<MembershipOffer|null>(null);
 const [offerError,setOfferError]=useState(false);
 useEffect(()=>{if(!seriousness||!canBuy||demo)return;let cancelled=false;setSeriousOffer(null);setOfferError(false);loadOffer(gender,'seriousness').then(offer=>{if(!cancelled)setSeriousOffer(offer)}).catch(()=>{if(!cancelled)setOfferError(true)});return()=>{cancelled=true}},[seriousness,canBuy,demo,gender,loadOffer,offerRevision]);
 const checkoutAvailable=canStart || (seriousness?seriousOffer?.sandboxCheckout:sandboxCheckout);
 const selectedPrice=seriousness?(demo?seriousnessPriceLabel(gender):seriousOffer?.price??null):price;
 const displayPrice=selectedPrice??(seriousness?seriousnessPriceLabel(gender):membershipPriceLabel(gender));
 const selectedPeriod=seriousness?seriousOffer?.period:period;
 const selectedPromo=seriousness?seriousOffer?.promotion:promotion;
 const trial=!selectedPromo&&!seriousness&&!active&&!demo&&Boolean(price)&&trialEligible;
 const gift=Boolean(giftUntil)||status==='granted';
 const end=giftUntil??expiry;
 const until=end?new Date(end):null;
 const offerKind=trial?'trial':'standard';
 const canMeasure=!demo&&!sandboxCheckout&&!active&&(!canBuy||Boolean(selectedPrice&&selectedPeriod));
 useEffect(()=>{if(canMeasure) launchEvent('offer_seen',offerKind,measurementOwner);},[canMeasure,offerKind,measurementOwner]);
 const leave=(choice:'left_offer'|'chose_free')=>{if(canMeasure || (choice==='chose_free' && !demo && !sandboxCheckout && !active))launchEvent(choice,offerKind,measurementOwner);back();};
 return <Frame title="عضوية وُدَين" back={()=>leave('left_offer')} className={`wd-paywall wd-paywall-${plan}`} headerAction={<img className="wd-header-logo" src="/brand/wudayn-emblem-v2.png" width="30" height="30" alt="شعار وُدَين"/>}>
  <p className="wd-current-membership">عضويتك الحالية <strong>{currentTier==='seriousness'?'وسام الجدية':active?'المميزة':'المجانية'}</strong></p>
  {status==='expired'&&<p className="wd-billing-note">انتهت صلاحية عضويتك.</p>}
  {status==='trial'&&<p className="wd-billing-note">تجربتك المجانية مفعّلة.</p>}
  {pilotEligible && startPilot && <TestingTrial busy={busy} accept={startPilot}/>}
  {(!active||currentTier==='premium')&&<div className="wd-plan-choice" role="group" aria-label="اختر عضويتك"><button type="button" aria-pressed={!seriousness} onClick={()=>setPlan('premium')}><img src="/brand/wudayn-member-seal.png" alt=""/><span><span className="wd-choice-name">المميزة{!seriousness&&<Check size={13} aria-hidden="true"/>}</span><small>{price??membershipPriceLabel(gender)}</small></span></button><button type="button" aria-pressed={seriousness} onClick={()=>setPlan('seriousness')}><img src="/brand/wudayn-seriousness-seal.png" alt=""/><span><span className="wd-choice-name">وسام الجدية{seriousness&&<Check size={13} aria-hidden="true"/>}</span><small>{seriousOffer?.price??seriousnessPriceLabel(gender)}</small></span></button></div>}
  <section className="wd-membership-card" aria-label="تفاصيل العضوية والسعر">
   {selectedPromo&&!active&&<div className="wd-return-offer"><strong>عرض العودة إلى {seriousness?'وسام الجدية':'وُدَين المميزة'}</strong><span>{selectedPromo.terms}</span></div>}
   {trial&&<div className="wd-trial-highlight"><strong>{introduction||'٧ أيام مجانًا'}</strong><span className="wd-trial-limit"><span>عرض إطلاق محدود</span><b><span>لأول ٥٠ امرأة</span><span>و٥٠ رجلًا</span></b></span></div>}
   <div className="wd-plan-portrait" key={plan}>
    <img src={seriousness?'/brand/wudayn-seriousness-seal.png':'/brand/wudayn-member-seal.png'} alt="" width="56" height="56"/>
    <div><h2>{seriousness?'وسام الجدية':'وُدَين المميزة'}</h2>
     <p>{seriousness?'كل مزايا المميزة، مع البحث مع لونا وطلب تحليل التوافق المعمّق.':'اطّلع على نسب التوافق في الاستكشاف، وبادر بطلب تعارف.'}</p>
    </div>
   </div>
   <p className="wd-plan-capacity">{seriousness?'ثلاثة تعارفات في الوقت نفسه':'تعارفان في الوقت نفسه'}</p>
   <div className="wd-price-row"><strong>{managing?'عضوية فعّالة':selectedPromo?'ثم '+displayPrice:displayPrice}</strong>{!managing&&<small>{selectedPeriod?' / '+selectedPeriod:' / شهريًا'}</small>}
   </div>
   {!managing&&!selectedPrice&&<p className="wd-price-context">سعر الباقة في السعودية. يظهر سعر متجرك عند الشراء.</p>}
   {active&&<p className="wd-price-context">{gift?(status==='paid'?'منحتك من وُدَين دون رسوم. يبقى اشتراكك في Apple منفصلًا عنها.':'منحة من وُدَين دون رسوم أو تجديد تلقائي للمنحة.'):'راجع سعر التجديد وموعده في اشتراكات Apple.'}</p>}
  </section>
  {active&&until&&!isNaN(until.getTime())&&<p className="wd-billing-note">عضويتك سارية حتى {until.toLocaleDateString('ar-SA',{calendar:'gregory',dateStyle:'long'})}.</p>}
  {!managing&&<p className="wd-billing-note">{selectedPromo?`بعد العرض، يتجدد الاشتراك بسعر ${selectedPrice} لكل ${selectedPeriod} عبر Apple حتى الإلغاء.`:trial?`٧ أيام مجانًا، ثم ${price} لكل ${selectedPeriod} بتجديد تلقائي عبر Apple. ألغِ قبل نهاية التجربة بـ٢٤ ساعة لتجنب الخصم.`:`${selectedPrice&&selectedPeriod?selectedPrice+' لكل '+selectedPeriod+'. ':''}تجديد تلقائي عبر Apple حتى الإلغاء.`}</p>}
  {!demo && !managing && canBuy && !selectedPrice && <p className="wd-billing-note" role="status">{(seriousness?offerError:priceFailed)
    ? (seriousness?'تعذّر تحميل وسام الجدية. حدّث عرض العضوية للمحاولة مجددًا.':'تعذّر تحميل سعر المميزة. حدّث عرض العضوية للمحاولة مجددًا.')
    : 'جارٍ تحميل سعر العضوية من المتجر…'}</p>}
  {demo?<button className="f-primary wd-purchase" onClick={back}>العودة للتجربة</button>:managing&&gift?<button type="button" className="f-primary wd-purchase" onClick={back}>متابعة بالعضوية الحالية</button>:managing?<button className="f-primary wd-purchase" disabled={!canBuy||busy} onClick={manage}>إدارة الاشتراك في Apple</button>:<button className="f-primary wd-purchase" disabled={(!checkoutAvailable&&!upgrading)||!canBuy||!selectedPrice||!selectedPeriod||busy} onClick={()=>{if(canMeasure)launchEvent('checkout',offerKind,measurementOwner);buy(plan,seriousness?seriousOffer??undefined:undefined);}}>{busy?'جارٍ المتابعة…':selectedPromo?'الاشتراك بعرض العودة':trial?'ابدأ أسبوعك المجاني':seriousness?'اشترك في وسام الجدية':'انضم إلى وُدَين المميزة'}</button>}
  {!active&&!demo&&<button className="f-link wd-continue" onClick={()=>leave('chose_free')}>المتابعة مجانًا</button>}
  {!canBuy&&!demo&&<p className="wd-billing-note">الاشتراك متاح من تطبيق وُدَين على iPhone.</p>}
  {!demo&&canBuy&&!managing&&(!checkoutAvailable||!selectedPrice)&&<button className="f-link centered" disabled={busy} onClick={refresh}>تحديث عرض العضوية</button>}
  {!active&&!checkoutAvailable&&selectedPrice&&<p className="flow-note">الاشتراك متاح بعد اعتماد ملفك وتوفر ترشيحات مناسبة. يمكنك متابعة حسابك مجانًا.</p>}
  <details className="wd-comparison-detail"><summary>قارن مزايا العضويات الثلاث</summary>
  <table className="wd-tier-comparison" data-plan={plan} aria-label="مقارنة العضوية المجانية والمميزة ووسام الجدية">
   <thead><tr><th scope="col">مزايا عضويتك</th><th scope="col">مجانية</th><th scope="col">مميزة</th><th scope="col" className="wd-seriousness-heading">وسام الجدية</th></tr></thead>
   <tbody>
    <tr className="wd-connection-counts"><th scope="row">التوافقات في نفس الوقت<BenefitInfo label="التوافقات في نفس الوقت">{benefitExplanations['التوافقات في نفس الوقت']}</BenefitInfo></th><td>١</td><td>٢</td><td>٣</td></tr>
    <tr><th scope="row">أولوية الظهور<BenefitInfo label="أولوية الظهور">يزيد ظهور ملفك عند تصفّح «جميع الملفات» في الاستكشاف.</BenefitInfo></th><td><span aria-label="غير متاح">—</span></td><td><span aria-label="غير متاح">—</span></td><td><span role="img" aria-label="متاح"><Check size={15}/></span></td></tr>
    <tr><th scope="row">البحث مع لونا<BenefitInfo label="البحث مع لونا">صف تفضيلاتك حتى ٦٠٠ حرف. تفهم لونا طلبك وتبحث ضمن التبويب والفلاتر النشطة وشروط الطرفين، وترتبها حسب مطابقة الوصف والتوافق. حتى ٣٠ بحثًا يوميًا.</BenefitInfo></th><td>—</td><td>—</td><td><span role="img" aria-label="متاح"><Check size={15}/></span></td></tr>
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
  </details>
  <div className="wd-actions">{!demo&&((!managing&&(status==='expired'||status==='trial'))||(gift&&status==='paid'))&&<button className="f-link" disabled={busy||!canBuy} onClick={manage}>إدارة الاشتراك في Apple</button>}{!demo&&<button className="f-link" disabled={busy||!canBuy} onClick={restore}>استعادة المشتريات</button>}<button className="f-link" onClick={onPolicy}>الشروط والخصوصية</button></div>
 </Frame>;
}
