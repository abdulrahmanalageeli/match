import { useId, useState } from 'react';
import { ArrowUpRight, CheckCheck, CircleHelp, Layers3, MessageCircle, ScanLine, ShieldCheck } from "../BrandIcons";
import { dimensionsForVersion, preferencePercentage, type MatchFit } from './model';
import { readPreferenceEvidence, reciprocalTopicAgreement, type PreferenceTopicStatus } from './preference-evidence';
import { MotionReveal } from '../motion/Reanimated';
import './preference-insights.css';

const ar = new Intl.NumberFormat('ar-SA', { numberingSystem: 'arab' });
type View = 'all' | 'aligned' | 'discussion' | 'missing';
type Topic = { id: string; status: PreferenceTopicStatus | 'discussion' };
const isDiscussion = (topic: Topic) => ['conditional', 'one_sided', 'different', 'discussion'].includes(topic.status);
const statusNames: Record<Topic['status'], string> = {
  aligned: 'احتياجات متوافقة', conditional: 'توافق مشروط أو قرار مفتوح', one_sided: 'تقارب في اتجاه واحد', different: 'احتياجات مختلفة',
  discussion: 'مساحة للنقاش', missing: 'بانتظار إجاباتكما',
};

function TopicCard({ topic, version }: { topic: Topic; version: string }) {
  const definition = dimensionsForVersion(version).find(item => item.id === topic.id);
  if (!definition) return null;
  const aligned = topic.status === 'aligned';
  const missing = topic.status === 'missing';
  const Icon = aligned ? CheckCheck : missing ? ScanLine : MessageCircle;
  const explanation = aligned ? definition.reason
    : topic.status === 'conditional' ? 'هناك مرونة أو قرار لم يُحسم أو توقيتان متقاربان. وضّحا الظروف التي تناسبكما.'
    : topic.status === 'one_sided' ? 'يناسب الاختيار أحدكما. ما الذي يحتاجه الطرف الآخر؟'
    : topic.status === 'different' ? 'تختلف رغبتاكما هنا. أين توجد مساحة للاتفاق؟'
    : missing ? 'نحتاج إلى إجابات من الطرفين.'
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
  const agreement = reciprocalTopicAgreement(fit, readout);
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
  return <section className="nf-preference-insights" aria-labelledby={titleId}>
    <header className="nf-pref-heading"><h3 id={titleId}>{percentage === null ? 'صورة تتضح بإجاباتكما' : 'ما الذي يجمعكما؟'}</h3></header>
    <div className="nf-pref-counts" role="group" aria-label="استعراض مواضيع التوافق">
      {groups.map(({ key, label, topics, icon: Icon }) => <button key={key} type="button" aria-pressed={view === key} aria-controls={topicsId} data-tone={key} onClick={() => setView(current => current === key ? 'all' : key)}>
        <Icon size={17} strokeWidth={1.5} aria-hidden="true" /><strong>{ar.format(topics.length)}</strong><span>{label}</span>
      </button>)}
    </div>
    {agreement && <p className="nf-pref-count-note">تحقّق الاتفاق المتبادل في {ar.format(agreement.agreed)} من {ar.format(agreement.total)} موضوعًا ({ar.format(agreement.percentage)}٪).</p>}
    <div className="nf-pref-selection"><span>{selected ? selected.key === 'aligned' ? 'أمور تتوافق فيها تفضيلاتكم' : selected.key === 'discussion' ? 'أمور تستاهل تتكلمون عنها' : 'أمور ما توضّحت من إجاباتكم' : 'من ملامح توافقكما'}</span>{view !== 'all' && <button type="button" onClick={() => setView('all')}>العودة للملخّص</button>}</div>
    <MotionReveal id={topicsId} className="nf-pref-topic-list" key={view} duration={280} distance={6}>
      {preview.length ? preview.map(topic => <TopicCard topic={topic} version={fit.version} key={topic.id} />) : <p className="nf-pref-empty">{view === 'aligned' ? 'لا توجد مواضيع مكتملة تحقق توافقًا في الاتجاهين حتى الآن.' : view === 'discussion' ? 'لا تظهر نقاط اختلاف في المواضيع المكتملة حاليًا.' : 'اكتملت الإجابات المطلوبة لمقارنة جميع المواضيع.'}</p>}
      {rest.length > 0 && <details className="nf-pref-more"><summary>عرض {view === 'all' ? 'بقية المواضيع' : 'المزيد'}<span>{ar.format(rest.length)}</span></summary><div>{rest.map(topic => <TopicCard key={topic.id} topic={topic} version={fit.version} />)}</div></details>}
    </MotionReveal>
    <details className="nf-pref-map">
      <summary><Layers3 size={17} strokeWidth={1.5} aria-hidden="true"/><span>الحياة كما تتخيّلانها<small>أسئلة من تفاصيل اليوم</small></span></summary>
      <dl className="nf-pref-conversation-starters">
        <div><dt>البيت</dt><dd>كيف تتخيّلان يومًا عاديًا في بيتكما؟</dd></div>
        <div><dt>الوقت</dt><dd>كيف تحبّان قضاء وقتكما بين العمل والأهل والراحة؟</dd></div>
        <div><dt>الحوار</dt><dd>متى تحبّان الرجوع للحديث بعد اختلاف؟</dd></div>
      </dl>
    </details>
    {fit.practicalConcerns?.includes('relocation') && <p>كل منكما يريد البقاء في مدينته، ومدينتاكما مختلفتان.</p>}
    {fit.practicalConcerns?.includes('age_range') && <p>العمر خارج النطاق المفضّل لأحد الطرفين على الأقل.</p>}
    {fit.practicalConcerns?.includes('children_intent') && <p>تختلف رغبتكما الشخصية في الإنجاب.</p>}
    {fit.practicalConcerns?.includes('location_unknown') && <p>نحتاج معرفة المدينتين لتقييم إمكانية السكن في مدينة مشتركة.</p>}
    <details className="nf-pref-criteria">
      <summary><ShieldCheck size={17} strokeWidth={1.5} aria-hidden="true"/><span>خصوصية اختياراتكما</span></summary>
      <div><p>تبقى تفضيلات كل طرف خاصة.</p></div>
    </details>
    <details className="nf-pref-method">
      <summary><CircleHelp size={17} strokeWidth={1.5} aria-hidden="true"/><span>قراءة ودّين</span></summary>
      <div><p>يعني الاتفاق أن رغبة كلّ طرف تتوافق مع إجابة الآخر.</p></div>
    </details>
    {readout.source === 'legacy' && <p className="nf-pref-legacy"><ArrowUpRight size={13} aria-hidden="true" /> يتوفر ملخّص المواضيع لهذا التقييم.</p>}
  </section>;
}
