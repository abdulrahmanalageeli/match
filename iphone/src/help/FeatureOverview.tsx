import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight } from '../BrandIcons';
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
    label: 'البداية', title: 'من لونا إلى ملف يستحق التعرّف',
    lead: 'تحكي عنك وعن اللي تتمناه، ثم تتصفّح جميع الملفات المؤهلة وتقرأ ما يجمعكم.',
    relatedAnswer: 'score', image: 'discovery-screen', alt: 'شاشة الاستكشاف الكاملة وفيها ملفات الأعضاء ونسب التوافق',
    caption: 'كل ملف مؤهل يبقى متاحًا لك، وتوضح النسبة مقدار توافق تفضيلاتكما المتبادل.',
    points: ['ابدأ من لونا', 'اقرأ الملف والتوافق', 'اختر من تودّ التعرّف عليه'],
  },
  {
    label: 'الميثاق', title: 'بداية واضحة قبل أول رسالة',
    lead: 'بعد قبول الطلب، تتفقان على حدود التعارف ومدته قبل أن تبدأ المحادثة.',
    relatedAnswer: 'agreement', image: 'agreement-screen', alt: 'شاشة ميثاق التعارف الكاملة واختيار مدة التعارف',
    caption: 'تختار المرأة ٧ أو ١٤ أو ٣٠ يومًا، وتبدأ المدة بعد توقيع الطرفين.',
    points: ['نية جادة وحدود واضحة', 'مدة يوافق عليها الطرفان', 'الخطوة التالية باتفاقكما'],
  },
  {
    label: 'الخصوصية', title: 'خصوصية مفهومة وقت الحاجة',
    lead: 'تختار طريقة إرسال الصورة، وتبقى المحادثة محمية داخل حدود ما يدعمه iPhone.',
    relatedAnswer: 'view-once', image: 'privacy-screen', alt: 'شاشة الخصوصية الكاملة التي تظهر عند حماية المحادثة',
    caption: 'الصورة لمرة واحدة تُفتح من تطبيق iPhone، وتوجد أدوات الحظر والإبلاغ داخل المحادثة والملف.',
    points: ['صورة لمرة واحدة', 'تنبيه عند رصد لقطة الشاشة', 'حظر وإبلاغ من مكانهما الطبيعي'],
  },
  {
    label: 'العضويات', title: 'اختر مساحة التعارف المناسبة لك',
    lead: 'تبدأ مجانًا، وتضيف العضويات المدفوعة المبادرة بالتعارف وقراءة أعمق للتوافق.',
    relatedAnswer: null, image: 'membership-screen', alt: 'شاشة العضوية الكاملة وتفاصيل عضوية وُدَين المميزة',
    caption: 'من صفحة العضوية يمكنك مقارنة المزايا وعدد التعارفات المتاحة لكل خطة.',
    points: ['المجانية للاستكشاف والاستقبال', 'المميزة للمبادرة وقراءة التوافق', 'وسام الجدية للبحث والتحليل المعمّق'],
  },
] as const;

export function GuideAnswerPreview({ answerId }: { answerId: string }) {
  const chapter = chapters.find(item => item.relatedAnswer === answerId);
  return chapter ? <img className="wd-guide-answer-image" src={`/brand/guide/${chapter.image}.png`} alt={chapter.alt} loading="lazy" /> : null;
}

export function FeatureOverview({ close, replay = false }: { close: () => void; replay?: boolean }) {
  const [chapter, setChapter] = useState(0);
  const [backward, setBackward] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointerStart = useRef<number | null>(null);
  const id = useId();
  const page = chapters[chapter];

  function turn(next: number) {
    if (next === chapter || next < 0 || next >= chapters.length) return;
    clearTimeout(leaveTimer.current);
    setLeaving(chapter);
    setBackward(next < chapter);
    setChapter(next);
    leaveTimer.current = setTimeout(() => setLeaving(null), 520);
  }
  function pointerDown(event: ReactPointerEvent) {
    pointerStart.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerUp(event: ReactPointerEvent) {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) < 42) return;
    turn(chapter + (distance < 0 ? 1 : -1));
  }

  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  useEffect(() => {
    if (!first.current || replay) {
      heading.current?.focus({ preventScroll: true });
      const guide = heading.current?.closest('.wd-overview');
      if (guide && guide.getBoundingClientRect().top < 0) guide.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    first.current = false;
  }, [chapter, replay]);

  return <section className="wd-overview" dir="rtl" lang="ar" aria-labelledby={id + '-title'}>
    <header className="wd-overview-bar"><img src="/brand/wudayn-wordmark.png" alt="وُدَين" width="68" height="36" />
      <button type="button" onClick={close}>{replay ? 'العودة للدليل' : 'تخطّي الجولة'} <ArrowLeft size={15} /></button></header>
    <nav className="wd-overview-nav" style={{ '--chapter': chapter } as CSSProperties} aria-label="أقسام الجولة">{chapters.map((item, index) =>
      <button key={item.label} type="button" aria-current={chapter === index ? 'step' : undefined} onClick={() => turn(index)}><span aria-hidden="true">{new Intl.NumberFormat('ar').format(index + 1)}</span>{item.label}</button>)}</nav>

    <div key={chapter} className="wd-overview-page" data-backward={backward || undefined}>
      <div className="wd-overview-copy">
        <p className="wd-overview-count">{new Intl.NumberFormat('ar').format(chapter + 1)} من {new Intl.NumberFormat('ar').format(chapters.length)}</p>
        <h1 ref={heading} tabIndex={-1} id={id + '-title'}>{page.title}</h1>
        <p>{page.lead}</p>
      </div>

      <figure className="wd-overview-shot">
        <div className="wd-overview-device" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { pointerStart.current = null; }}>
          {leaving !== null && <img className="wd-overview-screen wd-overview-screen--leaving" data-backward={backward || undefined}
            src={`/brand/guide/${chapters[leaving].image}.png`} alt="" aria-hidden="true" />}
          <img key={page.image} className="wd-overview-screen wd-overview-screen--current" data-backward={backward || undefined}
            src={`/brand/guide/${page.image}.png`} alt={page.alt} draggable="false" />
          <span className="wd-overview-device-edge" aria-hidden="true" />
        </div>
        <figcaption><span aria-hidden="true">{new Intl.NumberFormat('ar').format(chapter + 1).padStart(2, '٠')}</span>{page.caption}</figcaption>
      </figure>

      <ol className="wd-overview-points">{page.points.map((point, index) => <li key={point}><span>{new Intl.NumberFormat('ar').format(index + 1)}</span>{point}</li>)}</ol>
      <footer><button type="button" className="f-primary" onClick={() => chapter === chapters.length - 1 ? close() : turn(chapter + 1)}>
        {chapter === chapters.length - 1 ? (replay ? 'العودة للدليل' : 'متابعة إلى وُدَين') : 'التالي · ' + chapters[chapter + 1].label}<ArrowLeft size={17} /></button>
        {chapter > 0 && <button type="button" className="wd-overview-back" onClick={() => turn(chapter - 1)}><ArrowRight size={15} /> السابق</button>}</footer>
    </div>
  </section>;
}
