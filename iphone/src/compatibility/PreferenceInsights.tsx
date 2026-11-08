import { useId, useState } from 'react';
import { ArrowUpRight, CheckCheck, CircleHelp, Compass, Layers3, MessageCircle, ScanLine, ShieldCheck } from 'lucide-react';
import { categories, dimensions, preferencePercentage, type MatchFit } from './model';
import { readPreferenceEvidence, type PreferenceTopicStatus } from './preference-evidence';
import { MotionReveal } from '../motion/Reanimated';
import './preference-insights.css';

const ar = new Intl.NumberFormat('ar-SA', { numberingSystem: 'arab' });
type View = 'all' | 'aligned' | 'discussion' | 'missing';
type Topic = { id: string; status: PreferenceTopicStatus | 'discussion' };
const isDiscussion = (topic: Topic) => ['one_sided', 'different', 'discussion'].includes(topic.status);
const statusNames: Record<Topic['status'], string> = {
  aligned: 'احتياجات متوافقة', one_sided: 'تقارب في اتجاه واحد', different: 'احتياجات مختلفة',
  discussion: 'مساحة للنقاش', missing: 'بانتظار إجاباتكما',
};

function TopicCard({ topic }: { topic: Topic }) {
  const definition = dimensions.find(item => item.id === topic.id);
  if (!definition) return null;
  const aligned = topic.status === 'aligned';
  const missing = topic.status === 'missing';
  const Icon = aligned ? CheckCheck : missing ? ScanLine : MessageCircle;
  const explanation = aligned ? definition.reason
    : topic.status === 'one_sided' ? 'توافقت رغبة أحد الطرفين مع إجابة الآخر، بينما لم تتوافق الجهة الثانية. هذا موضوع لتوضيح ما يحتاجه كل منكما.'
    : topic.status === 'different' ? 'لم تتطابق رغبة أيٍّ منكما مع إجابة الآخر في هذا الموضوع. تحدثا عن احتياجاتكما ومساحة المرونة الممكنة.'
    : missing ? 'لم تكتمل الإجابات اللازمة للمقارنة في هذا الموضوع. لا نعتبر الصمت اتفاقًا أو اختلافًا.'
    : 'تظهر المقارنة اختلافًا يستحق الحديث. قد يساعدكما مثال من الحياة على فهم ما يناسب كل طرف.';
  return <article className="nf-pref-topic" data-tone={aligned ? 'aligned' : missing ? 'missing' : 'discussion'}>
    <div className="nf-pref-topic-top"><span className="nf-pref-topic-icon"><Icon size={17} strokeWidth={1.6} aria-hidden="true" /></span><span>{statusNames[topic.status]}</span></div>
    <h4>{definition.title}</h4>
    <p>{explanation}</p>
    {!missing && <details className="nf-pref-prompt"><summary><MessageCircle size={13} aria-hidden="true" /> سؤال يفتح الحوار</summary><blockquote>{definition.discussion}</blockquote></details>}
  </article>;
}

export function PreferenceInsights({ fit }: { fit: MatchFit }) {
  const [view, setView] = useState<View>('all');
  const titleId = useId();
  const topicsId = useId();
  const readout = readPreferenceEvidence(fit);
  const percentage = preferencePercentage(fit);
  if (readout.source === 'unavailable') return <section className="nf-pref-unavailable" aria-labelledby={titleId}>
    <ScanLine size={21} strokeWidth={1.5} aria-hidden="true" /><div><h3 id={titleId}>تفاصيل التوافق غير متاحة</h3><p>تعذّر عرض أسباب هذه النتيجة الآن. أعد فتح الملف للمحاولة مجددًا.</p></div>
  </section>;
  const aligned = readout.topics.filter(topic => topic.status === 'aligned');
  const discussion = readout.topics.filter(isDiscussion);
  const missing = readout.topics.filter(topic => topic.status === 'missing');
  const groups = [
    { key: 'aligned' as const, label: 'اتفاق', topics: aligned, icon: CheckCheck },
    { key: 'discussion' as const, label: 'للنقاش', topics: discussion, icon: MessageCircle },
    { key: 'missing' as const, label: 'لم يكتمل', topics: missing, icon: ScanLine },
  ];
  const selected = groups.find(group => group.key === view);
  const shown = selected?.topics ?? [aligned[0], discussion[0], ...(!aligned.length || !discussion.length ? missing.slice(0, 1) : [])].filter((topic): topic is Topic => Boolean(topic));
  const preview = shown.slice(0, 2);
  const rest = view === 'all' ? readout.topics.filter(topic => !preview.some(item => item.id === topic.id)) : shown.slice(2);
  const criteria = readout.criteria;

  return <section className="nf-preference-insights" aria-labelledby={titleId}>
    <header className="nf-pref-heading"><span><Compass size={15} strokeWidth={1.5} aria-hidden="true" /> من الإجابات إلى معنى</span><h3 id={titleId}>{percentage === null ? 'صورة تتضح بإجاباتكما' : 'ما الذي يجمعكما؟'}</h3><p>{percentage === null ? 'هذه قراءة للمواضيع المتاحة. تظهر نسبة التفضيلات بعد اكتمال التقييم لدى الطرفين.' : 'نقارن ما يبحث عنه كل طرف بما أجاب عنه الآخر. الاتفاق هنا يعني أن الرغبتين متوافقتان مع الإجابتين.'}</p></header>
    <div className="nf-pref-counts" role="group" aria-label="استعراض مواضيع التوافق">
      {groups.map(({ key, label, topics, icon: Icon }) => <button key={key} type="button" aria-pressed={view === key} aria-controls={topicsId} data-tone={key} onClick={() => setView(current => current === key ? 'all' : key)}>
        <Icon size={17} strokeWidth={1.5} aria-hidden="true" /><strong>{ar.format(topics.length)}</strong><span>{label}</span>
      </button>)}
    </div>
    <p className="nf-pref-count-note">الأعداد تلخّص المواضيع؛ النسبة تراعي الأوزان وأولوياتكما.</p>
    <div className="nf-pref-selection"><span>{selected ? selected.key === 'aligned' ? 'نقاط يمكن البناء عليها' : selected.key === 'discussion' ? 'مواضيع لفهم أعمق' : 'مساحة لم تتضح بعد' : 'من ملامح توافقكما'}</span>{view !== 'all' && <button type="button" onClick={() => setView('all')}>العودة للملخّص</button>}</div>
    <MotionReveal id={topicsId} className="nf-pref-topic-list" key={view} duration={280} distance={6}>
      {preview.length ? preview.map(topic => <TopicCard topic={topic} key={topic.id} />) : <p className="nf-pref-empty">{view === 'aligned' ? 'لا توجد مواضيع مكتملة تحقق توافقًا في الاتجاهين حتى الآن.' : view === 'discussion' ? 'لا تظهر نقاط اختلاف في المواضيع المكتملة حاليًا.' : 'اكتملت الإجابات المطلوبة لمقارنة جميع المواضيع.'}</p>}
      {rest.length > 0 && <details className="nf-pref-more"><summary>عرض {view === 'all' ? 'بقية المواضيع' : 'المزيد'}<span>{ar.format(rest.length)}</span></summary><div>{rest.map(topic => <TopicCard key={topic.id} topic={topic} />)}</div></details>}
    </MotionReveal>
    <details className="nf-pref-map"><summary><Layers3 size={17} strokeWidth={1.5} aria-hidden="true" /><span>خريطة التوافق<small>كيف تتوزع المواضيع على جوانب الحياة؟</small></span></summary><div className="nf-pref-map-body">
      <div className="nf-pref-map-legend"><span data-tone="aligned">اتفاق</span><span data-tone="discussion">للنقاش</span><span data-tone="missing">لم يكتمل</span></div>
      {readout.categories.map(category => <div className="nf-pref-category" key={category.id}>
        <div><h4>{categories.find(item => item.id === category.id)?.label ?? category.id}</h4><small>{ar.format(category.covered)} / {ar.format(category.total)} مكتمل</small></div>
        <div className="nf-pref-segments" role="img" aria-label={`${ar.format(category.aligned)} مواضيع اتفاق، ${ar.format(category.discussion)} للنقاش، ${ar.format(category.total-category.covered)} لم تكتمل`}>
          {Array.from({length: category.total}, (_, index) => <i key={index} data-tone={index < category.aligned ? 'aligned' : index < category.covered ? 'discussion' : 'missing'} />)}
        </div>
      </div>)}
      <p>كل جزء يمثّل موضوعًا واحدًا، وليس نقطة مئوية أو وزنًا في النتيجة.</p>
    </div></details>
    {criteria && criteria.total > 0 && <details className="nf-pref-criteria"><summary><ShieldCheck size={17} strokeWidth={1.5} aria-hidden="true" /><span>تفضيلاتكما الإضافية<small>التفاصيل التي اخترتما أن يكون لها وزن</small></span></summary><div><p>من {ar.format(criteria.total)} تفضيلًا إضافيًا عبر الاتجاهين: {ar.format(criteria.matched)} متوافق، و{ar.format(criteria.different)} غير متوافق، و{ar.format(criteria.missing)} لا تتوفر إجابته.</p><p>يشمل ذلك التفضيلات المحددة مثل الدراسة والعمل والتفاصيل الشخصية. لا نكشف اختيارات الشريك الخاصة أو ننسب هذه الأعداد إلى طرف بعينه.</p></div></details>}
    <details className="nf-pref-method"><summary><CircleHelp size={17} strokeWidth={1.5} aria-hidden="true" /><span>{readout.source === 'legacy' ? 'عن هذه القراءة' : percentage === null ? 'كيف تُحسب نسبة التفضيلات؟' : `كيف وصلنا إلى ${ar.format(percentage)}٪؟`}</span></summary><div>
      {readout.source === 'evidenced' ? <>
      <p>نحسب قراءة في كل اتجاه: مدى ملاءمة إجابات طرف لرغبات الطرف الآخر. ثم ندمج القراءتين بالمتوسط الهندسي، حتى لا يُخفي التوافق في اتجاه واحد اختلافًا في الاتجاه الثاني.</p>
      <div className="nf-pref-weights" aria-label="الأوزان الأساسية لمحاور التفضيلات">{categories.map(category => <span key={category.id}>{category.label}<b>{ar.format(category.weight)}٪</b></span>)}</div>
      <p>يتضاعف وزن المحور الذي حدّده صاحبه أولوية، ثم تُعاد موازنة الأوزان. إذا توفرت تفضيلات إضافية معلومة في اتجاه المقارنة، تشكّل ٢٠٪ من قراءته، والتقييم ٨٠٪. دونها نعتمد على التقييم وحده.</p>
      <p>«لا يهمّني» والإجابات المفقودة لا تضيف نقاطًا. العمر والسكن والشروط الأساسية تحدّد أهلية الترشيح، وليست مكافأة رقمية. هذه النسبة تصف توافق الإجابات، وليست احتمال نجاح الزواج.</p>
      </> : <p>نعرض ملخّص الاتفاق والنقاش المحفوظ مع هذه النتيجة. لا تتوفر لها تفاصيل حساب موثّقة، لذلك لا نستنتج النسبة من عدد المواضيع. توافق الإجابات لا يعبّر عن احتمال نجاح الزواج.</p>}
    </div></details>
    {readout.source === 'legacy' && <p className="nf-pref-legacy"><ArrowUpRight size={13} aria-hidden="true" /> هذه النتيجة تدعم ملخّص المواضيع؛ التفصيل في اتجاهي المقارنة غير متاح لها حاليًا.</p>}
  </section>;
}
