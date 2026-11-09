import { useEffect, useId, useState } from 'react';
import { CheckCheck, ChevronLeft, ChevronRight, CircleHelp, MessageCircle, PenLine, Sparkles } from 'lucide-react';
import type { MatchFit } from '../compatibility/model';
import { conversationInsights, type ConversationPrompt } from '../compatibility/conversation-insights';
import { MotionPressButton, MotionReveal } from '../motion/Reanimated';
import './chat-insights.css';

const ar = new Intl.NumberFormat('ar-SA', { numberingSystem: 'arab' });
const normalizeMessage = (value: string) => value.trim().replace(/\s+/g, ' ');
const topicId = (prompt: ConversationPrompt) => prompt.id.slice(prompt.id.indexOf(':') + 1);
const kindLabels: Record<ConversationPrompt['kind'], string> = {
  aligned: 'ما يجمعكما', discussion: 'لنفهم بعضنا', explore: 'بداية هادئة',
};

export function ChatInsights({ fit, name, disabled, hasDraft, usedMessages = [], choose }: {
  fit?: MatchFit; name: string; disabled: boolean; hasDraft: boolean;
  usedMessages?: string[]; choose: (text: string) => void;
}) {
  const headingId = useId();
  const cardId = useId();
  const [kind, setKind] = useState<ConversationPrompt['kind'] | 'all'>('all');
  const [position, setPosition] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const result = conversationInsights(fit);
  const used = new Set(usedMessages.map(normalizeMessage));
  const prompts = result.prompts.filter(item => !used.has(normalizeMessage(item.prompt)));
  const kinds = [...new Set(prompts.map(item => item.kind))];
  const selected = prompts.find(item => topicId(item) === selectedTopic);
  // Keep the topic in view when new answers change its order or classification.
  const activeKind = kind === 'all' ? kind : selected?.kind ?? (kinds.includes(kind) ? kind : 'all');
  const filtered = prompts.filter(item => activeKind === 'all' || item.kind === activeKind);
  const selectedIndex = filtered.findIndex(item => topicId(item) === selectedTopic);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : Math.min(position, Math.max(0, filtered.length - 1));
  const current = filtered[currentIndex];
  useEffect(() => { setSelectedTopic(current ? topicId(current) : null); }, [current?.id]);
  const Icon = current?.kind === 'aligned' ? CheckCheck : current?.kind === 'discussion' ? MessageCircle : Sparkles;
  const locked = disabled || hasDraft;

  function changeKind(next: ConversationPrompt['kind'] | 'all') {
    setKind(next);
    setPosition(0);
    const first = prompts.find(item => next === 'all' || item.kind === next);
    setSelectedTopic(first ? topicId(first) : null);
  }
  function moveTo(next: number) { setPosition(next); setSelectedTopic(topicId(filtered[next])); }

  return <section className="cm-chat-insights" aria-labelledby={headingId}>
    <div className="cm-insights-heading">
      <h3 id={headingId}>اقتراح للحديث مع <bdi>{name}</bdi></h3>
      <p>{result.source === 'general' ? 'أسئلة عامة للبداية. تتخصّص الاقتراحات عند اكتمال تقييميكما.' : 'أسئلة من نقاط اتفاقكما والمواضيع التي تحتاج إلى نقاش.'}</p>
    </div>
    {kinds.length > 1 && <div className="cm-insights-filters" role="group" aria-label="نوع بداية الحديث">
      {(['all', ...kinds] as const).map(value => <button key={value} type="button" aria-pressed={activeKind === value} aria-controls={cardId} onClick={() => changeKind(value)}>{value === 'all' ? 'لكما' : kindLabels[value]}</button>)}
    </div>}
    {current ? <>
      <div id={cardId} className="cm-insights-card-slot" aria-live="polite" aria-atomic="true">
        <MotionReveal as="article" key={current.id} className="cm-insights-card" data-kind={current.kind} duration={240} distance={7}>
          <div className="cm-insights-card-top"><span><Icon size={16} strokeWidth={1.5} aria-hidden="true" />{kindLabels[current.kind]}</span><small>{ar.format(currentIndex + 1)} / {ar.format(filtered.length)}</small></div>
          <h4>{current.title}</h4>
          <blockquote dir="auto">{current.prompt}</blockquote>
          <details className="cm-insights-context"><summary><CircleHelp size={14} aria-hidden="true" />لماذا هذا السؤال؟<ChevronLeft size={13} aria-hidden="true" /></summary><p>{current.context}</p></details>
        </MotionReveal>
      </div>
      <div className="cm-insights-navigation" aria-label="تصفّح اقتراحات الحديث">
        <button type="button" disabled={currentIndex === 0} onClick={() => moveTo(currentIndex - 1)} aria-label="الاقتراح السابق"><ChevronRight size={17} aria-hidden="true" /><span>السابق</span></button>
        <button type="button" disabled={currentIndex === filtered.length - 1} onClick={() => moveTo(currentIndex + 1)} aria-label="الاقتراح التالي"><span>التالي</span><ChevronLeft size={17} aria-hidden="true" /></button>
      </div>
      <MotionPressButton className="cm-insights-use" disabled={locked} onClick={() => { if (!locked) choose(current.prompt); }}><PenLine size={17} strokeWidth={1.7} aria-hidden="true" />أضف إلى مسودتي</MotionPressButton>
      <p className="cm-insights-draft-note" role={hasDraft ? 'status' : undefined}>{hasDraft ? 'لديك مسودة محفوظة. أكملها أو امسحها أولًا؛ لن نستبدل كلماتك.' : disabled ? 'يمكنك إضافة السؤال بعد إتاحة الكتابة في المحادثة.' : 'يمكنك تعديل السؤال قبل إرساله. لا يُرسل تلقائيًا.'}</p>
    </> : <div className="cm-insights-empty"><CheckCheck size={28} strokeWidth={1.4} aria-hidden="true" /><h4>أعطيتما هذه المواضيع مساحة</h4><p>الاقتراحات المتاحة موجودة بالفعل في الرسائل المحمّلة. واصلا من حيث وصل حديثكما، أو عودا بعد تحديث تقييمكما.</p></div>}
  </section>;
}
