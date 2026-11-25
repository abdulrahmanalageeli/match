import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown } from '../BrandIcons';
import './feature-overview.css';

const seenKey = 'wudayn.feature-overview.v1';
export function overviewSeen() {
  try { return localStorage.getItem(seenKey) === 'seen'; } catch { return false; }
}
export function rememberOverview() {
  try { localStorage.setItem(seenKey, 'seen'); } catch { /* The current visit still continues. */ }
}

const chapters = [
  {
    label: 'البداية', title: 'كيف يبدأ التعارف في وُدَين؟',
    lead: 'من أول حديث مع لونا إلى أول طلب تعارف، القرار في كل خطوة لك.',
    topics: [
      ['احكِ للونا عنك', 'احكِ عن حياتك والشريك اللي تتمناه، ثم راجع اقتراحات لونا.'],
      ['اكتشف الترشيحات', 'افتح الملف وشوف وش يجمعكم. تقدر تبدي اهتمامك أو ترسل طلب تعارف بحسب عضويتك.'],
      ['متى تبدأ المحادثة؟', 'بعد قبول الطلب وتوقيعكما على الميثاق ومدة التعارف.'],
    ],
  },
  {
    label: 'الميثاق', title: 'للتعارف مدة تختارانها معًا',
    lead: 'يبدأ العدّ بعد توقيعكما، ويتوقف إرسال الرسائل عند انتهاء المدة حتى تختارا الخطوة التالية.',
    topics: [
      ['بعد إرسال الميثاق', 'تختار المرأة المدة وتوقّع الميثاق، ثم يصل للطرف الآخر للتوقيع.'],
      ['أثناء التعارف', 'يمكنكما تبادل الرسائل والصوت والصور، وطلب إذن للمكالمات. تجدان موعد انتهاء المدة وتفاصيل الاتفاق داخل المحادثة.'],
      ['عند انتهاء المدة', 'يتوقف إرسال الرسائل. يمكن اقتراح التمديد أو التواصل العائلي، وتحتاج الخطوتان إلى موافقة الطرفين. ويمكن لأي طرف إنهاء التعارف.'],
    ],
  },
  {
    label: 'الخصوصية', title: 'ما الذي يبقى بينكما؟',
    lead: 'استأذن قبل حفظ صورة أو مشاركة حديث، حتى مع تفعيل حماية الشاشة.',
    topics: [
      ['لقطات الشاشة في المحادثة', 'في تطبيق الآيفون تُحمى الصور والملفات والمحادثات حسب دعم النظام. إذا أخذت لقطة داخل محادثة التعارف الفردية ورصدها التطبيق، يصل تنبيه إلى الطرف الآخر في إشعارات وُدَين. في المتصفح لا يمكن رصد لقطات النظام بشكل موثوق.'],
      ['الصور الخاصة وقفل التطبيق', 'اختر «عرض لمرة واحدة» عند إرسال صورة خاصة. تُفتح من تطبيق الآيفون. ويمكنك تفعيل قفل الجهاز من الإعدادات لحماية دخولك إلى وُدَين.'],
      ['الحظر والإبلاغ', 'من خيارات الملف أو المحادثة تستطيع حظر عضو أو إرسال بلاغ لفريق وُدَين. ومشاركة التفاصيل مع الأهل تبدأ بموافقتكما.'],
    ],
  },
  {
    label: 'العضويات', title: 'اختر ما يناسب خطوتك',
    lead: 'تتيح العضوية المجانية تصفّح الملفات واستقبال الطلبات. تختلف الخطط في المبادرة بالتعارف وقراءة التوافق.',
    topics: [
      ['المجانية · تعارف واحد في الوقت نفسه', 'أكمل جلسة لونا، واستكشف الملفات، وأبدِ اهتمامك. يمكنك قبول طلب وارد والتواصل بعد الاتفاق على الميثاق.'],
      ['المميزة · تعارفان في الوقت نفسه', 'أرسل طلبات التعارف واقرأ نقاط الاتفاق والاختلاف في جميع الملفات، واستفد من أسئلة حديث مبنية على توافقكما.'],
      ['وسام الجدية · ثلاثة تعارفات في الوقت نفسه', 'يشمل مزايا المميزة، وأولوية الظهور، والبحث مع لونا. يمكنك أيضًا طلب تحليل معمّق للتوافق بعد موافقة الطرف الآخر.'],
    ],
  },
] as const;

export function FeatureOverview({ close, replay = false }: { close: () => void; replay?: boolean }) {
  const [chapter, setChapter] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const id = useId();
  const page = chapters[chapter];
  function turn(next: number) {
    if (next === chapter) return;
    setExpanded(0);
    setChapter(next);
  }
  useEffect(() => {
    if (!first.current || replay) heading.current?.focus();
    first.current = false;
  }, [chapter, replay]);

  return <section className="wd-overview" dir="rtl" lang="ar" aria-labelledby={id+'-title'}>
    <header className="wd-overview-bar"><img src="/brand/wudayn-wordmark.png" alt="وُدَين" width="68" height="36"/>
      <button type="button" onClick={close}>{replay?'العودة للدليل':'تخطّي الجولة'} <ArrowLeft size={15}/></button></header>
    <img className="wd-overview-art" src="/brand/welcome/shared-future-mobile.webp" alt="" width="720" height="480"/>
    <nav className="wd-overview-nav" aria-label="أقسام الجولة">{chapters.map((item,index)=>
      <button key={item.label} type="button" aria-current={chapter===index?'step':undefined} onClick={()=>turn(index)}>{item.label}</button>)}</nav>
    <div className="wd-overview-page">
      <h1 ref={heading} tabIndex={-1} id={id+'-title'}>{page.title}</h1><p>{page.lead}</p>
      <div className="wd-overview-topics">{page.topics.map(([label,detail],index)=>
        <div key={label}><button type="button" aria-expanded={expanded===index} aria-controls={id+'-detail-'+index}
          onClick={()=>setExpanded(expanded===index?null:index)}>{label}<ChevronDown size={17} aria-hidden="true"/></button>
          <p hidden={expanded!==index} id={id+'-detail-'+index}>{detail}</p></div>)}</div>
      <footer><button type="button" className="f-primary" onClick={()=>chapter===chapters.length-1?close():turn(chapter+1)}>
        {chapter===chapters.length-1?(replay?'العودة للدليل':'متابعة إلى وُدَين'):'التالي · '+chapters[chapter+1].label}<ArrowLeft size={17}/></button>
        {chapter>0&&<button type="button" className="wd-overview-back" onClick={()=>turn(chapter-1)}><ArrowRight size={15}/> السابق</button>}</footer>
    </div>
  </section>;
}
