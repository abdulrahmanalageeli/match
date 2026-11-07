import { useLayoutEffect, useRef } from 'react';
import { Check, ChevronDown, LockKeyhole, ShieldCheck } from 'lucide-react';
import type { SignupConsents } from './consent';
import './consent.css';
type Key=Exclude<keyof SignupConsents,'version'>;
const copy:Record<Key,{title:string;detail:string}>={
  adult:{title:'عمري ١٨ عامًا فأكثر',detail:'وأتعهد بصحة معلوماتي، وبأنني أستخدم الحساب لنفسي ولغرض تعارف جاد بقصد الزواج.'},
  terms:{title:'أوافق على شروط الاستخدام',detail:'وألتزم بالتعامل الجاد والمحترم، واحترام الخصوصية، وعدم انتحال شخصية أو إساءة استخدام الصور.'},
  privacy:{title:'اطّلعت على إشعار الخصوصية',detail:'وأفهم البيانات المستخدمة، وما يظهر للأعضاء، وحقوقي وطرق التواصل بشأنها.'},
  sensitiveProfile:{title:'أوافق على معالجة التفاصيل الحساسة · اختياري',detail:'أوافق صراحةً على معالجة ما أختاره من الخلفية القبلية ودرجة البشرة والمذهب والممارسة الدينية، واستخدام تفضيلات الخلفية والمظهر في التوافق. لا نقيّم الالتزام الديني ولا نستنتج هذه التفاصيل. عرضها للأعضاء يحتاج إلى اختياري المنفصل أدناه.'},
  sensitivePublication:{title:'أوافق على عرض التفاصيل الحساسة · اختياري',detail:'أوافق صراحةً على عرض ما أدخلته من الخلفية القبلية واسم القبيلة ودرجة البشرة والمذهب والممارسة الدينية، والصورة الرمزية التي تعكس درجة البشرة، للأعضاء المؤهلين. يمكنني إيقاف العرض مع إبقاء البيانات خاصة لأغراض المعالجة والتوافق.'},
  assessment:{title:'أوافق على تحليل إجاباتي للتوافق · اختياري',detail:'تُقارن إجابات التفضيلات والشخصية ومواقف «بيننا» آليًا لعرض مؤشرات ومواضيع للنقاش. لا تتنبأ المؤشرات بنجاح الزواج، وتبقى الإجابات الفردية ومتطلبات الشريك خاصة. قصتك لا تدخل في الحساب، ولا تظهر في ملفك إلا باختيارك.'},
  photo:{title:'أوافق على عرض صورة ملفي · اختياري',detail:'تظهر النسخة بدرجة التمويه المختارة للأعضاء المؤهلين. إذا اخترت الإزالة التلقائية، تُحفظ نسخة واضحة خاصة وتُعرض للطرف المؤهل عند الموعد الذي حددته فقط. التمويه لا يضمن إخفاء الهوية. يمكنني تعطيل الكشف أو إزالة الصورة أو استبدالها بصورة رمزية.'},
};
export function ConsentChoice({kind,checked,change}:{kind:Key;checked:boolean;change:(value:boolean)=>void}){
 return <label className="nf-consent-choice"><input type="checkbox" checked={checked} onChange={e=>change(e.target.checked)}/><span><strong>{copy[kind].title}</strong><small>{copy[kind].detail}</small></span></label>;
}
export function ConsentGate({kind,checked,change,compact=false}:{kind:'sensitiveProfile'|'assessment';checked:boolean;change:(v:boolean)=>void;compact?:boolean}){
 const summary=useRef<HTMLElement>(null),gate=useRef<HTMLElement>(null),restoreFocus=useRef(false);
 function choose(value:boolean){restoreFocus.current=compact;change(value);}
 useLayoutEffect(()=>{
  if(!restoreFocus.current)return;
  restoreFocus.current=false;
  if(compact)(checked?summary.current:gate.current?.querySelector<HTMLInputElement>('input[type="checkbox"]'))?.focus({preventScroll:true});
 },[checked,compact]);
 if(compact&&checked)return <details className="nf-consent-manage"><summary ref={summary}><Check size={15} aria-hidden="true"/><span>{kind==='assessment'?'تحليل التوافق مفعّل':'معالجة التفاصيل الحساسة مفعّلة'}<small>إدارة موافقتي</small></span><ChevronDown size={15} aria-hidden="true"/></summary><ConsentChoice kind={kind} checked={checked} change={choose}/></details>;
 return <section ref={gate} className="nf-consent-gate"><div><LockKeyhole size={18}/><span>القرار لك، قبل الإجابة</span></div><ConsentChoice kind={kind} checked={checked} change={choose}/>{!checked&&<p>يمكنك المتابعة دون هذه التفاصيل. لن يؤثر التخطي في إمكانية إنشاء حسابك. يمكنك العودة إليها من الإعدادات.</p>}</section>;
}
export function SignupConsentReview({value,change,onPrivacy,preview}:{value:SignupConsents;change:(kind:Key,v:boolean)=>void;onPrivacy:()=>void;preview?:boolean}){
 return <section className="nf-consent-review" data-field="consent" tabIndex={-1}><header><ShieldCheck size={20}/><div><h2>{preview?'راجع خيارات الموافقة في التجربة':'أنت تتحكم في بياناتك'}</h2><p>{preview?'هذه محاكاة؛ لا تنشئ حسابًا ولا تُرسل موافقات قانونية.':'خيارات منفصلة وواضحة، دون موافقات محددة مسبقًا.'}</p></div></header>{(['adult','terms','privacy'] as const).map(kind=><ConsentChoice key={kind} kind={kind} checked={value[kind]} change={v=>change(kind,v)}/>)}<button type="button" className="nf-intake-policy" onClick={onPrivacy}>قراءة الشروط وإشعار الخصوصية</button><details><summary>مراجعة الأذونات الاختيارية</summary><ConsentChoice kind="sensitiveProfile" checked={value.sensitiveProfile} change={v=>change('sensitiveProfile',v)}/>{value.sensitiveProfile&&<ConsentChoice kind="sensitivePublication" checked={value.sensitivePublication} change={v=>change('sensitivePublication',v)}/>}<ConsentChoice kind="assessment" checked={value.assessment} change={v=>change('assessment',v)}/><p>إلغاء العرض يخفي التفاصيل الحساسة دون حذفها. إلغاء المعالجة يزيل بياناتها من الملف عند الحفظ. إزالة الصورة متاحة من قسم «صورتك»؛ الصور الخاصة بالمحادثات منفصلة.</p></details></section>;
}
