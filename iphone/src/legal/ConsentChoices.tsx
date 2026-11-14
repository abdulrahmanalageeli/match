import { useLayoutEffect, useRef } from 'react';
import { Check, ChevronDown, LockKeyhole, ShieldCheck, Sparkles } from "../BrandIcons";
import type { SignupConsents } from './consent';
import './consent.css';
type Key=Exclude<keyof SignupConsents,'version'>;
const copy:Record<Key,{title:string;detail:string}>={
  adult:{title:'عمري ١٨ عامًا فأكثر',detail:'وأتعهد بصحة معلوماتي، وبأنني أستخدم الحساب لنفسي ولغرض تعارف جاد بقصد الزواج.'},
  terms:{title:'أوافق على شروط الاستخدام',detail:'وألتزم بالتعامل الجاد والمحترم، واحترام الخصوصية، وعدم انتحال شخصية أو إساءة استخدام الصور.'},
  privacy:{title:'اطّلعت على إشعار الخصوصية',detail:'وأفهم البيانات المستخدمة، وما يظهر للأعضاء، وحقوقي وطرق التواصل بشأنها.'},
  sensitiveProfile:{title:'أوافق على معالجة التفاصيل الحساسة · اختياري',detail:'أوافق صراحةً على معالجة ما أختاره من الخلفية القبلية ودرجة البشرة والمذهب والممارسة الدينية، واستخدام تفضيلات الخلفية والمظهر في التوافق. لا نقيّم الالتزام الديني ولا نستنتج هذه التفاصيل. عرضها للأعضاء يحتاج إلى اختياري المنفصل أدناه.'},
  sensitivePublication:{title:'أوافق على عرض التفاصيل الحساسة · اختياري',detail:'أوافق صراحةً على عرض ما أدخلته من الخلفية القبلية واسم القبيلة ودرجة البشرة والمذهب والممارسة الدينية، والصورة الرمزية التي تعكس درجة البشرة، للأعضاء المؤهلين. يمكنني إيقاف العرض مع إبقاء البيانات خاصة لأغراض المعالجة والتوافق.'},
  assessment:{title:'أوافق على تحليل إجاباتي للتوافق',detail:'تُقارن إجابات التفضيلات والشخصية ومواقف «بيننا» آليًا لعرض مؤشرات ومواضيع للنقاش. لا تتنبأ المؤشرات بنجاح الزواج، وتبقى الإجابات الفردية ومتطلبات الشريك خاصة. قصتك لا تدخل في الحساب، ولا تظهر في ملفك إلا باختيارك.'},
  photo:{title:'أوافق على عرض صورة ملفي · اختياري',detail:'تظهر النسخة بدرجة التمويه المختارة للأعضاء المؤهلين. إذا اخترت الإزالة التلقائية، تُحفظ نسخة واضحة خاصة وتُعرض للطرف المؤهل عند الموعد الذي حددته فقط. التمويه لا يضمن إخفاء الهوية. يمكنني تعطيل الكشف أو إزالة الصورة أو استبدالها بصورة رمزية.'},
};
export function ConsentChoice({kind,checked,change,required=false}:{kind:Key;checked:boolean;change:(value:boolean)=>void;required?:boolean}){
 return <label className="nf-consent-choice"><input type="checkbox" checked={checked} aria-required={required||undefined} onChange={e=>change(e.target.checked)}/><span><strong>{required&&kind==='assessment'?'أوافق على جلسة التوافق واستخدام الذكاء الاصطناعي':required?copy[kind].title.replace(' · اختياري',''):copy[kind].title}</strong><small>{required&&kind==='assessment'?'هذه الموافقة مطلوبة لإكمال التسجيل. يساعدك المرافق الآلي على توضيح تفضيلاتك وشخصيتك، ثم تراجع ملخصك قبل اعتماده. لا تظهر رسائلك للأعضاء، ولا يُعد التحليل تشخيصًا أو ضمانًا لنجاح الزواج.':copy[kind].detail}</small></span></label>;
}
export function ConsentGate({kind,checked,change,compact=false,required=false}:{kind:'sensitiveProfile'|'assessment';checked:boolean;change:(v:boolean)=>void;compact?:boolean;required?:boolean}){
 const summary=useRef<HTMLElement>(null),gate=useRef<HTMLElement>(null),restoreFocus=useRef(false);
 function choose(value:boolean){restoreFocus.current=compact;change(value);}
 useLayoutEffect(()=>{
  if(!restoreFocus.current)return;
  restoreFocus.current=false;
  if(compact)(checked?summary.current:gate.current?.querySelector<HTMLInputElement>('input[type="checkbox"]'))?.focus({preventScroll:true});
 },[checked,compact]);
 if(compact&&checked&&required&&kind==='assessment')return <section className="nf-consent-manage nf-consent-required-receipt"><div><Check size={15} aria-hidden="true"/><span>موافقة تحليل التوافق محفوظة<small>مطلوبة لإكمال التسجيل، وتبقى قابلة للإدارة من الإعدادات بعد إنشاء الحساب.</small></span></div></section>;
 if(compact&&checked)return <details className="nf-consent-manage"><summary ref={summary}><Check size={15} aria-hidden="true"/><span>{kind==='assessment'?'تحليل التوافق مفعّل':'معالجة التفاصيل الحساسة مفعّلة'}<small>إدارة موافقتي</small></span><ChevronDown size={15} aria-hidden="true"/></summary><ConsentChoice kind={kind} checked={checked} change={choose} required={required}/></details>;
 return <section ref={gate} className="nf-consent-gate"><div><LockKeyhole size={18}/><span>{required?(kind==='assessment'?'قبل أن نبدأ الحوار':'قبل إضافة التفاصيل'):'القرار لك، قبل الإجابة'}</span></div><ConsentChoice kind={kind} checked={checked} change={choose} required={required}/>{!checked&&<p>{required?(kind==='assessment'?'جلسة التوافق جزء أساسي من إعداد ملفك. إذا تعذّرت الخدمة، نساعدك على إكمال الأسئلة مباشرة.':'موافقتك الصريحة مطلوبة لإكمال التسجيل. لا نحفظ هذه التفاصيل الحساسة قبل موافقتك.'):'يمكنك المتابعة دون هذه التفاصيل والعودة إليها من الإعدادات.'}</p>}</section>;
}
export function SignupConsentReview({value,change,onPrivacy,requiredAssessment=false,requiredSensitive=false,recorded=false}:{value:SignupConsents;change:(kind:Key,v:boolean)=>void;onPrivacy:()=>void;preview?:boolean;requiredAssessment?:boolean;requiredSensitive?:boolean;recorded?:boolean}){
 const accepted=recorded;
 return <section className="nf-consent-review" data-field="consent" tabIndex={-1}>
  {accepted ? <p className="nf-consent-receipt"><ShieldCheck size={18}/> موافقات حسابك محفوظة. لا تحتاج إلى تأكيدها مرة أخرى.</p> : <><header><ShieldCheck size={20}/><div><h2>قبل إرسال الملف</h2><p>نحتاج هذه الموافقات مرة واحدة.</p></div></header>{(['adult','terms','privacy'] as const).map(kind=><ConsentChoice key={kind} kind={kind} checked={value[kind]} change={v=>change(kind,v)}/>)}</>}
  {requiredAssessment&&<div className={`nf-consent-required-receipt nf-consent-required-receipt--review${value.assessment?' is-accepted':''}`} role="status"><div><Sparkles size={17} aria-hidden="true"/><span><strong>تحليل التوافق جزء من طلب العضوية</strong><small>{value.assessment?'وافقت على استخدام الذكاء الاصطناعي لفهم تفضيلاتك وشخصيتك. راجعت الملخص قبل اعتماده.':'يجب قبول تحليل إجاباتك بالذكاء الاصطناعي قبل إرسال الملف.'}</small></span></div>{value.assessment&&<Check size={17} aria-label="تمت الموافقة"/>}</div>}
  <button type="button" className="nf-intake-policy" onClick={onPrivacy}>الشروط وإشعار الخصوصية</button>
  <details><summary>إدارة أذونات الخصوصية</summary><ConsentChoice kind="sensitiveProfile" required={requiredSensitive} checked={value.sensitiveProfile} change={v=>change('sensitiveProfile',v)}/>{value.sensitiveProfile&&<ConsentChoice kind="sensitivePublication" required={requiredSensitive} checked={value.sensitivePublication} change={v=>change('sensitivePublication',v)}/>}{requiredAssessment ? <p>تحليل التوافق مفعّل لإعداد ملفك. يمكنك إدارة بياناتك وأذوناتك من الإعدادات.</p> : <ConsentChoice kind="assessment" checked={value.assessment} change={v=>change('assessment',v)}/>}<p>إلغاء العرض يخفي التفاصيل الحساسة دون حذفها. إلغاء المعالجة يزيل بياناتها من الملف عند الحفظ. إدارة الصورة متاحة من قسم «صورتك».</p></details>
 </section>;
}
