import { useId } from 'react';
import { ArrowUpLeft, BookOpen, Check, HeartHandshake, MessageCircle, Quote } from "../BrandIcons";
import { beenaScenarios, beenaVersion, type BeenaFit } from './model';
import './beena.css';

const number = new Intl.NumberFormat('ar-SA', { numberingSystem: 'arab' });
const topicTitle = (id: string) => beenaScenarios.find(scenario => scenario.id === id)?.title;

export function BeenaSummary({ fit, story, compact = false, onPrompt }: {
  fit?: BeenaFit; story?: { scenarioId: string; text: string }; compact?: boolean; onPrompt?: (text: string) => void;
}) {
  const id = useId();
  const known = fit?.version === beenaVersion ? fit : undefined;
  const complete = known?.complete && known.total === beenaScenarios.length && known.covered === known.total;
  const percentage = complete && typeof known.percentage === 'number' && Number.isFinite(known.percentage) && known.percentage >= 0 && known.percentage <= 100 ? Math.round(known.percentage) : null;
  const aligned = [...new Set(known?.aligned ?? [])].map(topicTitle).filter(Boolean);
  const discussion = [...new Set(known?.discussion ?? [])].map(topicTitle).filter(Boolean);
  const prompts = (known?.prompts ?? []).filter(prompt => topicTitle(prompt.scenarioId)).sort((a, b) => Number(b.kind === 'discussion') - Number(a.kind === 'discussion')).slice(0, 2);
  const storyOnly = Boolean(story?.text.trim() && !fit);
  if (compact) return <div className="bn-compact" aria-label={percentage === null ? 'بيننا: المواقف غير مكتملة' : `بيننا: تقبّل المواقف ${number.format(percentage)} بالمئة`}><HeartHandshake size={16}/><span>بيننا</span><strong>{percentage === null ? <small>بانتظار المواقف</small> : <>{number.format(percentage)}<small>٪</small></>}</strong></div>;
  return <section className="bn-summary" aria-labelledby={id}>
    <header className="bn-summary-heading"><span className="bn-emblem"><HeartHandshake size={22} strokeWidth={1.5}/></span><div><span className="bn-eyebrow">{storyOnly ? 'موقف بكلماتي' : 'مواقف من حياتكما'}</span><h3 id={id}>بيننا</h3></div>{!storyOnly && <div className="bn-summary-score"><strong>{percentage === null ? '—' : <>{number.format(percentage)}<small>٪</small></>}</strong><span>{percentage === null ? 'بانتظار اكتمال المواقف' : 'تقبّل متبادل'}</span></div>}</header>
    {!storyOnly && <p className="bn-summary-description">{percentage === null ? `اكتملت إجاباتكما المشتركة عن ${number.format(known?.covered ?? 0)} من ${number.format(beenaScenarios.length)} مواقف. تظهر النسبة بعد إكمالكما جميع المواقف.` : 'نقارن ما يفعله كل منكما بما يرتاح إليه الآخر. التكامل لا يعني أن تختارا التصرف نفسه.'}</p>}
    {(aligned.length > 0 || discussion.length > 0) && <div className="bn-reading">
      {aligned.length > 0 && <div><h4><Check size={15}/> تصرفات يتقبّلها كلاكما</h4><p>{aligned.join('، ')}</p></div>}
      {discussion.length > 0 && <div><h4><MessageCircle size={15}/> مساحات تستحق الحديث</h4><p>{discussion.join('، ')}</p></div>}
    </div>}
    {prompts.length > 0 && <div className="bn-conversation-prompts"><h4><BookOpen size={15}/> ابدآ من موقف واحد</h4>{prompts.map(prompt => onPrompt ? <button type="button" key={prompt.scenarioId} onClick={() => onPrompt(prompt.prompt)}><span>{prompt.prompt}</span><ArrowUpLeft size={16}/></button> : <p key={prompt.scenarioId}>{prompt.prompt}</p>)}{onPrompt && <small>يُضاف السؤال كمسودة لتراجعه قبل الإرسال.</small>}</div>}
    {story?.text.trim() && <blockquote className="bn-shared-story"><span><Quote size={17}/>{topicTitle(story.scenarioId) ?? 'موقف بكلماتي'}</span><p dir="auto">{story.text}</p><footer>قصة شاركها صاحب الملف · لا تدخل في النسبة</footer></blockquote>}
    {!storyOnly && <p className="bn-summary-footnote">قراءة من اختياراتكما، وليست توقعًا لنجاح الزواج. اختلاف موقف فرصة للفهم، وليس حكمًا على شخص.</p>}
  </section>;
}
