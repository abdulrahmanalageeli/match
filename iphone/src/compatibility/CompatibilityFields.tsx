import { sharedDecisionLabel, sharedDecisionPrompt } from './sharedDecisions';
import memberAr from '../member-copy.ts';
import { useId, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, CookingPot, Dice5, Footprints, Heart, Landmark, PenLine, Plane, SlidersHorizontal, Sparkles, Star, UserRound } from "../BrandIcons";
import { categories, practicalAnswerKeys, hasPartnerQuestion, applicableDimensions, interests, maxInterests, maxPriorities, type CompatibilitySelection } from "./model";
import { hasPreferenceAnswer } from "../onboarding/remainingAssessments";
import "./fields.css";
import "./question-experience.css";

import type { PartnerCriteria } from './marriage';

type Props = CompatibilitySelection & { version?: string; childrenCount?: number; partnerChildren?: PartnerCriteria['children']; gender?: "woman" | "man"; registration?: boolean; remainingOnly?: boolean; required?: boolean; onChange: (next: CompatibilitySelection) => void };
const interestIcons = { reading: BookOpen, cooking: CookingPot, walking: Footprints, travel: Plane,
  photography: Camera, board_games: Dice5, museums: Landmark, creative_writing: PenLine };
const number = new Intl.NumberFormat("ar-SA", { numberingSystem: "arab" });
const sectionOrder = ["plans", "timing", "values", "lifestyle", "communication", "personality"];
const sections = sectionOrder.map(id => categories.find(category => category.id === id)!);
export function CompatibilityFields({ version, childrenCount, partnerChildren, interestIds, surveyAnswers, hardRequirements, priorityCategories, onChange, gender, registration = false, remainingOnly = false, required = false }: Props) {
  const dimensions = applicableDimensions(version,surveyAnswers,childrenCount,partnerChildren);
  const topics = sections.flatMap(section => dimensions.filter(dim => dim.category === section.id));
  const questions = topics.flatMap((topic, index) => practicalAnswerKeys(topic, version).map((key, side) => ({
    position: index * 2 + side, category: topic.category, answered: hasPreferenceAnswer(topic.options, surveyAnswers[key]),
  })));
  const total = questions.length;
  const filled = questions.filter(question => question.answered).length;
  const firstMissing = questions.find(question => !question.answered)?.position ?? -1;
  const prefix = useId();
  const completedHere = useRef(new Set<number>()), previousMode = useRef(remainingOnly);
  if (previousMode.current !== remainingOnly) { completedHere.current.clear(); previousMode.current = remainingOnly; }
  const [remainingFinished, setRemainingFinished] = useState(false);
  const card = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), outline = useRef<HTMLDetailsElement>(null);
  const shouldFocus = useRef(false);
  const [position, setPosition] = useState(() => Math.max(0, firstMissing));
  const [interestsOpen, setInterestsOpen] = useState(!registration && interestIds.length === 0);
  useLayoutEffect(() => { setRemainingFinished(false); }, [remainingOnly]);
  const [direction, setDirection] = useState<"next" | "back">("next");
  const positions = questions.filter(question => !remainingOnly || completedHere.current.has(question.position) || !question.answered)
    .map(question => question.position);
  const activePosition = positions.includes(position) ? position : positions.find(at => at >= position) ?? positions[0] ?? 0;
  const questionIndex = positions.indexOf(activePosition);
  const topicIndex = Math.floor(activePosition / 2), dim = topics[topicIndex];
  const side = activePosition % 2 === 0 ? "self" : "partner";
  const answerKey = side === "self" ? dim.id : dim.partnerId;
  const value = surveyAnswers[answerKey] ?? "";
  const category = sections.find(section => section.id === dim.category)!;
  const isPriority = priorityCategories.includes(category.id);
  const remainingDone = remainingOnly && (positions.length === 0 || remainingFinished) && (!required || filled === total);
  const answered = hasPreferenceAnswer(dim.options, value);
  const [separateTopic,setSeparateTopic] = useState<string>();
  const [jointlyAnsweredTopic, setJointlyAnsweredTopic] = useState<string>();
  const jointPrompt = registration && remainingOnly && (!version || version === 'marriage-v4')
    && !hardRequirements.includes(dim.id) && separateTopic !== dim.id && (!surveyAnswers[dim.partnerId] || (side === 'self' && jointlyAnsweredTopic === dim.id))
    ? sharedDecisionPrompt(dim.id,gender) : undefined;
  const sharedPrompt = side === 'self' ? jointPrompt : undefined;
  const saved = side === 'partner' && jointPrompt ? dim.options.find(option=>option.code===surveyAnswers[dim.id]) : undefined;
  const prompt = sharedPrompt ?? (dim.id === "wife_work" && side === "self" && gender === "woman" ? "هل ترغبين في العمل بعد الزواج؟" : side === "self" ? dim.selfPrompt : dim.partnerPrompt);
  function change(partial: Partial<CompatibilitySelection>) { onChange({ interestIds, surveyAnswers, hardRequirements, priorityCategories, ...partial }); }
  function toggleInterest(id: string) {
    if (interestIds.includes(id)) change({ interestIds: interestIds.filter(value => value !== id) });
    else if (interestIds.length < maxInterests) change({ interestIds: [...interestIds, id] });
  }
  function selectAnswer(next: string) {
    if (required && !next) return;
    completedHere.current.add(activePosition);
    const answers = { ...surveyAnswers };
    if (sharedPrompt) {
      if (next) {
        answers[dim.partnerId] = next;
        setJointlyAnsweredTopic(dim.id);
      } else {
        delete answers[dim.partnerId];
      }
    }
    if (next) answers[answerKey] = next; else delete answers[answerKey];
    change({ surveyAnswers: answers, hardRequirements: !next && side === "partner" ? hardRequirements.filter(id => id !== dim.id) : hardRequirements });
  }
  function move(next: number) {
    if (!positions.includes(next)) return;
    if (required && next > activePosition && !answered) return;
    setRemainingFinished(false);
    if (next === activePosition) return;
    setJointlyAnsweredTopic(undefined);
    shouldFocus.current = true;
    setDirection(next > activePosition ? "next" : "back");
    setPosition(next);
  }
  useLayoutEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    heading.current?.focus({ preventScroll: true });
    card.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [activePosition]);

  const interestPicker = <details className="compat-interests" open={interestsOpen} onToggle={event => setInterestsOpen(event.currentTarget.open)}>
      <summary><span className="compat-detail-icon"><Heart size={19} aria-hidden="true"/></span><span><strong>تفاصيل صغيرة، تشبهك</strong><small>{interestIds.length ? interests.filter(item => interestIds.includes(item.id)).map(item => item.label).join(" · ") : "أضف حتى ثلاثة أشياء تستمتع بها"}</small></span><ChevronDown size={16} aria-hidden="true"/></summary>
      <div className="compat-chips" role="group" aria-label="اهتماماتك">
        {interests.map(({ id, label }) => {
          const selected = interestIds.includes(id), Icon = selected ? Check : interestIcons[id];
          return <button key={id} type="button" aria-pressed={selected} disabled={!selected && interestIds.length >= maxInterests} onClick={() => toggleInterest(id)}><Icon size={17} aria-hidden="true"/>{label}</button>;
        })}
      </div>
      <p className="compat-interest-note" aria-live="polite">{number.format(interestIds.length)} من {number.format(maxInterests)} اهتمامات</p>
    </details>;
  const nextQuestionPosition = positions[questionIndex + 1];
  const assessmentNote = <p className="compat-assessment-note">اختر ما يصفك، ثم حدّد ما يناسبك من شريكك. يمكن أن تختلف الإجابتان. {required ? 'لا توجد إجابة صحيحة أو خاطئة.' : 'ويمكنك تجاوز أي سؤال.'}</p>;

  return <div className="compat-fields" dir="rtl">
    {!registration && interestPicker}
    <section ref={card} className="compat-assessment" aria-labelledby={remainingDone ? undefined : prefix + "-heading"} aria-label={remainingDone ? 'ملخص إجابات التوافق' : undefined}>
      <header className="compat-section-head"><span><Sparkles size={16} aria-hidden="true"/> صورتك عن الحياة</span><span className="compat-counter" aria-live="polite">{number.format(filled)} من {number.format(total)} إجابة</span></header>
      {!registration && assessmentNote}
      <div className="compat-answer-meter" role="progressbar" aria-label="إجابات التوافق" aria-valuemin={0} aria-valuemax={total} aria-valuenow={filled}><span style={{ transform: `scaleX(${filled / total})` }}/></div>
      {remainingDone ? <div className="compat-assessment-recap" role="status"><span className="compat-recap-icon"><Check size={18} aria-hidden="true"/></span><p><strong>{filled === total ? 'تفضيلاتك مكتملة ومحفوظة في المسودة' : 'هذه بقية تفضيلاتك'}</strong><small>{filled === total ? 'لن نطلب منك الإجابة عنها مرة أخرى. يمكنك مراجعتها من ملخص الملف.' : `بقيت ${number.format(total-filled)} إجابات${required ? " لنكمل صورتك عن الحياة." : " اختيارية. يمكنك إكمالها أو متابعة التسجيل."}`}</small></p>{firstMissing >= 0 && <button type="button" onClick={() => { completedHere.current.clear(); setRemainingFinished(false); setPosition(firstMissing); }}>إكمال المتبقي<ChevronLeft size={15}/></button>}</div> : <div className="compat-question-workspace">
      <details ref={outline} className="compat-outline">
        <summary><span>{category.label}<small>الفكرة {number.format(topicIndex + 1)} من {number.format(topics.length)}</small></span><span className="compat-outline-action">{registration ? "المواضيع والدليل" : "المواضيع"}<ChevronDown size={14} aria-hidden="true"/></span></summary>
        {registration && <div className="compat-answer-guide"><strong>كيف تجيب؟</strong>{assessmentNote}</div>}
        <div className="compat-sections" aria-label="انتقل إلى موضوع">
          {sections.filter(section => !remainingOnly || topics.some((topic,index)=>topic.category===section.id&&(positions.includes(index*2)||positions.includes(index*2+1)))).map(section => <div key={section.id}><strong>{section.label}<small>{number.format(questions.filter(q => q.category === section.id && q.answered).length)} / {number.format(questions.filter(q => q.category === section.id).length)}</small></strong>
            <div>{topics.flatMap((topic, index) => topic.category !== section.id || (remainingOnly && !positions.includes(index*2) && !positions.includes(index*2+1)) ? [] : [<button key={topic.id} type="button" disabled={required && !answered && index > topicIndex} aria-pressed={topicIndex === index} onClick={() => { move(positions.includes(index * 2) ? index * 2 : index * 2 + 1); if (outline.current) outline.current.open = false; }}>{topic.title}{practicalAnswerKeys(topic, version).every(key => hasPreferenceAnswer(topic.options, surveyAnswers[key])) && <Check size={13} aria-label="مكتمل"/>}</button>])}</div>
          </div>)}
        </div>
      </details>

      {!jointPrompt && hasPartnerQuestion(dim.id, version) && <div className="compat-perspective" role="group" aria-label="زاوية الإجابة">
        {(!remainingOnly || positions.includes(topicIndex * 2)) && <button type="button" aria-pressed={side === "self"} onClick={() => move(topicIndex * 2)}><UserRound size={15} aria-hidden="true"/>أنا{surveyAnswers[dim.id] && <Check size={13} aria-label="أجبت"/>}</button>}
        {positions.includes(topicIndex * 2 + 1) && <button type="button" disabled={required && !answered && side === "self"} aria-pressed={side === "partner"} onClick={() => move(topicIndex * 2 + 1)}><Heart size={15} aria-hidden="true"/>شريك الحياة{surveyAnswers[dim.partnerId] && <Check size={13} aria-label="أجبت"/>}</button>}
      </div>}
      <div className="compat-panel" key={answerKey} data-dir={direction}>
        <span className="compat-topic-label"><span>{dim.title}</span>{registration && <span className="compat-question-position" aria-label={`السؤال ${number.format(questionIndex + 1)} من ${number.format(positions.length)}`}>{number.format(questionIndex + 1)} / {number.format(positions.length)}</span>}</span>
        <h3 ref={heading} id={prefix + "-heading"} tabIndex={-1}>{saved ? dim.title : prompt}</h3>
        <p className="compat-hint">{saved ? sharedDecisionLabel(dim.id,saved.code,saved.self) : sharedPrompt ? 'ترتيب أفضّله لنا' : side === "self" ? "اختر الأقرب إلى حياتك كما تتصورها." : "اختر ما تتمنى مشاركته مع الطرف الآخر."}</p>
        <div className="compat-answer-options" role="group" aria-labelledby={prefix + "-heading"}>
          {saved ? <button type="button" className="compat-choice" onClick={()=>selectAnswer(saved.code)}>أعتمد هذا الترتيب لنا</button> : dim.options.map(option => <button className="compat-choice" type="button" key={option.code} aria-pressed={value === option.code} onClick={() => selectAnswer(option.code)}><span className="compat-choice-dot" aria-hidden="true">{value === option.code && <Check size={13}/>}</span><span>{dim.id === "wife_work" && side === "self" && gender === "woman" ? (memberAr.womanWork as Record<string,string>)[option.code] : sharedPrompt ? sharedDecisionLabel(dim.id,option.code,option.self) : option[side]}</span></button>)}
        </div>
        {jointPrompt && <button type="button" className="f-link" onClick={() => {
          if (jointlyAnsweredTopic === dim.id) completedHere.current.add(topicIndex * 2 + 1);
          setSeparateTopic(dim.id);
          setJointlyAnsweredTopic(undefined);
        }}>أختار لنفسي ولشريكي بشكل مختلف</button>}
        {!required && <button className="compat-skip" type="button" onClick={() => { selectAnswer(""); if (!value && questionIndex < positions.length-1) move(positions[questionIndex+1]); else if (!value && remainingOnly) setRemainingFinished(true); }}>{value ? "إزالة اختياري" : side === "self" ? "أتجاوز هذا السؤال الآن" : "ليس لدي تفضيل محدد — متابعة"}</button>}
        {dim.id === "residence_plan" && <p className="compat-footnote">إذا اخترت مدينة نتفق عليها، حدّد مدن الانتقال من تصفية الملفات بعد التسجيل.</p>}
        <details className="compat-refine">
          <summary><SlidersHorizontal size={14} aria-hidden="true"/>ما أهمية هذا لك؟{(isPriority || hardRequirements.includes(dim.id)) && <span>محددة</span>}<ChevronDown size={13} aria-hidden="true"/></summary>
          <label className="compat-priority"><input type="checkbox" checked={isPriority} disabled={!isPriority && priorityCategories.length >= maxPriorities} onChange={() => change({ priorityCategories: isPriority ? priorityCategories.filter(id => id !== category.id) : [...priorityCategories, category.id] })}/><span><strong><Star size={14} aria-hidden="true"/>من أولوياتي</strong><small>امنح «{category.label}» أهمية أكبر. يمكنك اختيار محورين.</small></span></label>
          {hasPartnerQuestion(dim.id, version) && dim.hardAllowed && surveyAnswers[dim.partnerId] && <label className="compat-hard"><input type="checkbox" checked={hardRequirements.includes(dim.id)} onChange={event => change({ hardRequirements: event.target.checked ? [...hardRequirements, dim.id] : hardRequirements.filter(id => id !== dim.id) })}/><span><strong>شرط أساسي عندي</strong><small>{version && version !== 'marriage-v4' ? "يُشترط أن تلائم إجابة الطرف الآخر تفضيلك." : "أشترط في الشريك: " + dim.options.find(o=>o.code===surveyAnswers[dim.partnerId])?.partner}</small></span></label>}
        </details>
      </div>
      <footer className="compat-navigation"><button type="button" className="compat-previous" disabled={questionIndex <= 0} onClick={() => move(positions[questionIndex - 1])}><ChevronRight size={17} aria-hidden="true"/>السابق</button>
        {nextQuestionPosition !== undefined ? <button type="button" className="compat-next" disabled={required && !answered} onClick={() => move(nextQuestionPosition)}>{remainingOnly ? "السؤال التالي" : side === "self" && hasPartnerQuestion(dim.id, version) ? "وماذا عن شريك الحياة؟" : "الفكرة التالية"}<ChevronLeft size={17} aria-hidden="true"/></button> : remainingOnly ? <button type="button" className="compat-next" disabled={required && !answered} onClick={() => required && firstMissing >= 0 ? move(firstMissing) : setRemainingFinished(true)}>{required && firstMissing >= 0 ? "إكمال المتبقي" : "اكتملت المراجعة"}<Check size={16}/></button> : <span className="compat-finish"><Check size={16} aria-hidden="true"/>{required && filled < total ? "اختر إجابتك لنكمل الملف" : "هذه آخر فكرة، أكمل ملفك أدناه"}</span>}
      </footer>
      </div>}
      {!remainingOnly && questionIndex === positions.length-1 && <div className="compat-assessment-recap" role="status"><span className="compat-recap-icon"><Check size={18} aria-hidden="true"/></span><p><strong>{filled === total ? 'اكتملت صورتك عن الحياة' : 'وصلت إلى آخر فكرة'}</strong><small>{filled === total ? 'يمكنك مراجعة إجاباتك من المواضيع، ثم متابعة التسجيل.' : `بقيت ${number.format(total-filled)} إجابات${required ? " لنكمل صورتك عن الحياة." : " اختيارية. يمكنك إكمالها أو متابعة التسجيل الآن."}`}</small></p>{firstMissing >= 0 && firstMissing !== position && <button type="button" onClick={()=>move(firstMissing)}>إكمال المتبقي<ChevronLeft size={15} aria-hidden="true"/></button>}</div>}
    </section>
    {remainingOnly && <details className="compat-refine"><summary><SlidersHorizontal size={14}/>{required ? "ما الأهم لك؟" : "أولوياتك وشروطك الاختيارية"}<ChevronDown size={13}/></summary><p className="compat-assessment-note">لا نختار الأولويات أو الشروط الأساسية بدلًا عنك.</p>{sections.map(section => <label className="compat-priority" key={section.id}><input type="checkbox" checked={priorityCategories.includes(section.id)} disabled={!priorityCategories.includes(section.id) && priorityCategories.length >= maxPriorities} onChange={event => change({priorityCategories:event.target.checked?[...priorityCategories,section.id]:priorityCategories.filter(id=>id!==section.id)})}/><span><strong>{section.label}</strong></span></label>)}{topics.filter(topic=>hasPartnerQuestion(topic.id, version)&&topic.hardAllowed&&hasPreferenceAnswer(topic.options,surveyAnswers[topic.partnerId])).map(topic=><label className="compat-hard" key={topic.id}><input type="checkbox" checked={hardRequirements.includes(topic.id)} onChange={event=>change({hardRequirements:event.target.checked?[...hardRequirements,topic.id]:hardRequirements.filter(id=>id!==topic.id)})}/><span><strong>{topic.title} · شرط أساسي</strong><small>{version && version !== 'marriage-v4' ? "يُشترط أن تلائم إجابة الطرف الآخر تفضيلك." : "أشترط في الشريك: " + topic.options.find(o=>o.code===surveyAnswers[topic.partnerId])?.partner}</small></span></label>)}</details>}
    {registration && interestPicker}
  </div>;
}
