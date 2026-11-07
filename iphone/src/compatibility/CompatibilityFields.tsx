import { useId, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, CookingPot, Dice5, Footprints, Heart, Landmark, PenLine, Plane, SlidersHorizontal, Sparkles, Star, UserRound } from "lucide-react";
import { categories, dimensions, interests, maxInterests, maxPriorities, type CompatibilitySelection } from "./model";
import "./fields.css";

type Props = CompatibilitySelection & { gender?: "woman" | "man"; onChange: (next: CompatibilitySelection) => void };
const interestIcons = { reading: BookOpen, cooking: CookingPot, walking: Footprints, travel: Plane,
  photography: Camera, board_games: Dice5, museums: Landmark, creative_writing: PenLine };
const number = new Intl.NumberFormat("ar-SA", { numberingSystem: "arab" });
const sectionOrder = ["plans", "timing", "values", "lifestyle", "communication", "personality"];
const sections = sectionOrder.map(id => categories.find(category => category.id === id)!);
const topics = sections.flatMap(section => dimensions.filter(dim => dim.category === section.id));
const total = topics.length * 2;
function countAnswers(category: string, answers: Record<string, string>) {
  return topics.filter(dim => dim.category === category)
    .reduce((n, dim) => n + Number(Boolean(answers[dim.id])) + Number(Boolean(answers[dim.partnerId])), 0);
}

export function CompatibilityFields({ interestIds, surveyAnswers, hardRequirements, priorityCategories, onChange, gender }: Props) {
  const prefix = useId();
  const card = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), outline = useRef<HTMLDetailsElement>(null);
  const shouldFocus = useRef(false);
  const [position, setPosition] = useState(() => {
    const missing = topics.flatMap(dim => [dim.id, dim.partnerId]).findIndex(id => !surveyAnswers[id]);
    return missing < 0 ? 0 : missing;
  });
  const [interestsOpen, setInterestsOpen] = useState(interestIds.length === 0);
  const [direction, setDirection] = useState<"next" | "back">("next");
  const topicIndex = Math.floor(position / 2), dim = topics[topicIndex];
  const side = position % 2 === 0 ? "self" : "partner";
  const answerKey = side === "self" ? dim.id : dim.partnerId;
  const value = surveyAnswers[answerKey] ?? "";
  const category = sections.find(section => section.id === dim.category)!;
  const isPriority = priorityCategories.includes(category.id);
  const filled = topics.reduce((n, topic) => n + Number(Boolean(surveyAnswers[topic.id])) + Number(Boolean(surveyAnswers[topic.partnerId])), 0);
  const firstMissing = topics.flatMap(topic => [topic.id, topic.partnerId]).findIndex(id => !surveyAnswers[id]);
  const prompt = dim.id === "wife_work" && side === "self" && gender === "woman" ? "هل ترغبين في العمل بعد الزواج؟" : side === "self" ? dim.selfPrompt : dim.partnerPrompt;
  function change(partial: Partial<CompatibilitySelection>) { onChange({ interestIds, surveyAnswers, hardRequirements, priorityCategories, ...partial }); }
  function toggleInterest(id: string) {
    if (interestIds.includes(id)) change({ interestIds: interestIds.filter(value => value !== id) });
    else if (interestIds.length < maxInterests) change({ interestIds: [...interestIds, id] });
  }
  function selectAnswer(next: string) {
    const answers = { ...surveyAnswers };
    if (next) answers[answerKey] = next; else delete answers[answerKey];
    change({ surveyAnswers: answers, hardRequirements: !next && side === "partner" ? hardRequirements.filter(id => id !== dim.id) : hardRequirements });
  }
  function move(next: number) {
    if (next === position || next < 0 || next >= total) return;
    shouldFocus.current = true;
    setDirection(next > position ? "next" : "back");
    setPosition(next);
  }
  useLayoutEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    heading.current?.focus({ preventScroll: true });
    card.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [position]);

  return <div className="compat-fields" dir="rtl">
    <details className="compat-interests" open={interestsOpen} onToggle={event => setInterestsOpen(event.currentTarget.open)}>
      <summary><span className="compat-detail-icon"><Heart size={19} aria-hidden="true"/></span><span><strong>تفاصيل صغيرة، تشبهك</strong><small>{interestIds.length ? interests.filter(item => interestIds.includes(item.id)).map(item => item.label).join(" · ") : "أضف حتى ثلاثة أشياء تستمتع بها"}</small></span><ChevronDown size={16} aria-hidden="true"/></summary>
      <div className="compat-chips" role="group" aria-label="اهتماماتك">
        {interests.map(({ id, label }) => {
          const selected = interestIds.includes(id), Icon = selected ? Check : interestIcons[id];
          return <button key={id} type="button" aria-pressed={selected} disabled={!selected && interestIds.length >= maxInterests} onClick={() => toggleInterest(id)}><Icon size={17} aria-hidden="true"/>{label}</button>;
        })}
      </div>
      <p className="compat-interest-note" aria-live="polite">{number.format(interestIds.length)} من {number.format(maxInterests)} اهتمامات · اختيارية وتظهر في ملفك</p>
    </details>

    <section ref={card} className="compat-assessment" aria-labelledby={prefix + "-heading"}>
      <header className="compat-section-head"><span><Sparkles size={16} aria-hidden="true"/> صورتك عن الحياة</span><span className="compat-counter" aria-live="polite">{number.format(filled)} من {number.format(total)} إجابة</span></header>
      <p className="compat-assessment-note">كل فكرة من زاويتين: ما يشبهك، وما تبحث عنه في شريك الحياة. ويمكنك تجاوز أي سؤال.</p>
      <div className="compat-answer-meter" role="progressbar" aria-label="إجابات التوافق" aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled}><span style={{ transform: `scaleX(${filled / total})` }}/></div>
      <details ref={outline} className="compat-outline">
        <summary><span>{category.label}<small>الفكرة {number.format(topicIndex + 1)} من {number.format(topics.length)}</small></span><span className="compat-outline-action">المواضيع<ChevronDown size={14} aria-hidden="true"/></span></summary>
        <div className="compat-sections" aria-label="انتقل إلى موضوع">
          {sections.map(section => <div key={section.id}><strong>{section.label}<small>{number.format(countAnswers(section.id, surveyAnswers))} / {number.format(topics.filter(topic => topic.category === section.id).length * 2)}</small></strong>
            <div>{topics.flatMap((topic, index) => topic.category !== section.id ? [] : [<button key={topic.id} type="button" aria-pressed={topicIndex === index} onClick={() => { move(index * 2); if (outline.current) outline.current.open = false; }}>{topic.title}{surveyAnswers[topic.id] && surveyAnswers[topic.partnerId] && <Check size={13} aria-label="مكتمل"/>}</button>])}</div>
          </div>)}
        </div>
      </details>

      <div className="compat-perspective" role="group" aria-label="زاوية الإجابة">
        <button type="button" aria-pressed={side === "self"} onClick={() => move(topicIndex * 2)}><UserRound size={15} aria-hidden="true"/>أنا{surveyAnswers[dim.id] && <Check size={13} aria-label="أجبت"/>}</button>
        <button type="button" aria-pressed={side === "partner"} onClick={() => move(topicIndex * 2 + 1)}><Heart size={15} aria-hidden="true"/>شريك الحياة{surveyAnswers[dim.partnerId] && <Check size={13} aria-label="أجبت"/>}</button>
      </div>
      <div className="compat-panel" key={answerKey} data-dir={direction}>
        <span className="compat-topic-label">{dim.title}</span>
        <h3 ref={heading} id={prefix + "-heading"} tabIndex={-1}>{prompt}</h3>
        <p className="compat-hint">{side === "self" ? "اختر الأقرب إلى حياتك كما تتصورها." : "اختر ما تتمنى مشاركته مع الطرف الآخر."}</p>
        <div className="compat-answer-options" role="group" aria-labelledby={prefix + "-heading"}>
          {dim.options.map(option => <button className="compat-choice" type="button" key={option.code} aria-pressed={value === option.code} onClick={() => selectAnswer(option.code)}><span className="compat-choice-dot" aria-hidden="true">{value === option.code && <Check size={13}/>}</span><span>{dim.id === "wife_work" && side === "self" && gender === "woman" ? ({ A: "أرغب في العمل ومواصلة طموحي", B: "أفضل عدم العمل بعد الزواج", C: "مرنة حسب ظروفي واتفاقنا" } as Record<string,string>)[option.code] : option[side]}</span></button>)}
        </div>
        <button className="compat-skip" type="button" onClick={() => { selectAnswer(""); if (!value && position < total-1) move(position+1); }}>{value ? "إزالة اختياري" : side === "self" ? "أتجاوز هذا السؤال الآن" : "ليس لدي تفضيل محدد — متابعة"}</button>
        {dim.id === "residence_plan" && <p className="compat-footnote">وضوح تفضيل السكن يساعد في الترشيح من مدينة أخرى إذا كان الانتقال ممكنًا لأحدكما.</p>}
        <details className="compat-refine">
          <summary><SlidersHorizontal size={14} aria-hidden="true"/>ما أهمية هذا لك؟{(isPriority || hardRequirements.includes(dim.id)) && <span>محددة</span>}<ChevronDown size={13} aria-hidden="true"/></summary>
          <label className="compat-priority"><input type="checkbox" checked={isPriority} disabled={!isPriority && priorityCategories.length >= maxPriorities} onChange={() => change({ priorityCategories: isPriority ? priorityCategories.filter(id => id !== category.id) : [...priorityCategories, category.id] })}/><span><strong><Star size={14} aria-hidden="true"/>من أولوياتي</strong><small>امنح «{category.label}» أهمية أكبر. يمكنك اختيار محورين.</small></span></label>
          {dim.hardAllowed && surveyAnswers[dim.partnerId] && <label className="compat-hard"><input type="checkbox" checked={hardRequirements.includes(dim.id)} onChange={event => change({ hardRequirements: event.target.checked ? [...hardRequirements, dim.id] : hardRequirements.filter(id => id !== dim.id) })}/><span><strong>شرط أساسي عندي</strong><small>يُرشَّح من اختار تفضيلك لنفسه فقط.</small></span></label>}
        </details>
      </div>
      <footer className="compat-navigation"><button type="button" className="compat-previous" disabled={position === 0} onClick={() => move(position - 1)}><ChevronRight size={17} aria-hidden="true"/>السابق</button>
        {position < total - 1 ? <button type="button" className="compat-next" onClick={() => move(position + 1)}>{side === "self" ? "وماذا عن شريك الحياة؟" : "الفكرة التالية"}<ChevronLeft size={17} aria-hidden="true"/></button> : <span className="compat-finish"><Check size={16} aria-hidden="true"/>هذه آخر فكرة، أكمل ملفك أدناه</span>}
      </footer>
      {position === total-1 && <div className="compat-assessment-recap" role="status"><span className="compat-recap-icon"><Check size={18} aria-hidden="true"/></span><p><strong>{filled === total ? 'اكتملت صورتك عن الحياة' : 'وصلت إلى آخر فكرة'}</strong><small>{filled === total ? 'يمكنك مراجعة إجاباتك من المواضيع، ثم متابعة التسجيل.' : `بقيت ${number.format(total-filled)} إجابات اختيارية. يمكنك إكمالها أو متابعة التسجيل الآن.`}</small></p>{firstMissing >= 0 && firstMissing !== position && <button type="button" onClick={()=>move(firstMissing)}>إكمال المتبقي<ChevronLeft size={15} aria-hidden="true"/></button>}</div>}
    </section>
  </div>;
}
