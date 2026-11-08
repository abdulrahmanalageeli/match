import { useId, useRef } from "react";
import { BookOpen, CircleHelp, Fingerprint, MessageCircle, SlidersHorizontal } from "lucide-react";
import { dimensions, preferencePercentage, personalityPercentage, type MatchFit } from "./model";
export { preferencePercentage, personalityPercentage } from "./model";
import { PersonalityAnalysis } from "./PersonalityAnalysis";
import { BeenaSummary } from "../beena/BeenaSummary";
import "./fit.css";

const arabic = new Intl.NumberFormat("ar-SA", { numberingSystem: "arab" });
const labels: Record<MatchFit["band"], string> = {
  insufficient: "صورة أولية", strong: "انسجام واضح", mixed: "توافق مع نقاط للنقاش", explore: "فرصة للتعرّف",
};
const topic = (id: string) => dimensions.find(dimension => dimension.id === id);

export function suggestedQuestions(fit?: MatchFit) {
  const ids = fit && ["marriage-v1", "marriage-v2"].includes(fit.version) ? [...fit.discussion, ...fit.missing, ...fit.strengths] : [];
  const questions = ids.map(id => topic(id)?.discussion).filter((value): value is string => Boolean(value));
  const situations = fit?.beena?.version === 'beena-v1' ? [...fit.beena.prompts].sort((a, b) => Number(b.kind === 'discussion') - Number(a.kind === 'discussion')).map(item => item.prompt) : [];
  return [...new Set([...situations, ...questions, "كيف تتصور توزيع المسؤوليات في بيتنا؟", "عند الاختلاف، ما الذي يساعدك على العودة للحوار؟"])].slice(0, 3);
}

export function FitDetails({ fit }: { fit: MatchFit }) {
  const heading = useId();
  const personalityId=useId();
  const personalityPanel=useRef<HTMLDetailsElement>(null);
  if (!["marriage-v1", "marriage-v2"].includes(fit.version)) return null;
  const missing = fit.missing.map(topic).filter(value => value !== undefined);
  const preference = preferencePercentage(fit);
  const personality = personalityPercentage(fit);
  const personalityUnavailable=personality===null&&fit.personality?.complete===true;
  function explainPersonality(){
    const panel=personalityPanel.current;if(!panel)return;
    panel.open=true;
    panel.querySelector('summary')?.focus({preventScroll:true});
    const reduced=document.documentElement.dataset.nfMotion==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
  }
  return <section className="nf-fit" aria-labelledby={heading}>
    <header className="nf-fit-heading">
      <h2 id={heading} className="nf-fit-title">التوافق بينكما</h2>
      <p>التفضيلات، والطباع، ومواقف الحياة. لكلٍّ قراءة مستقلة.</p>
    </header>
    <div className="nf-fit-scores">
      <div className="nf-fit-score" data-fit-score="preferences">
        <SlidersHorizontal className="nf-score-icon" size={20} strokeWidth={1.5} aria-hidden="true"/>
        <h3>توافق التفضيلات</h3>
        <strong aria-label={preference === null ? 'بانتظار التقييمين' : undefined}>{preference === null ? <span className="nf-score-pending" aria-hidden="true">—</span> : <>{arabic.format(preference)}<small>٪</small></>}</strong>
        <div className="nf-score-track" aria-hidden="true"><span style={{width:`${preference ?? 0}%`}}/></div>
        <p>{preference === null ? 'بانتظار اكتمال التقييمين' : 'ما تبحثان عنه في شريك الحياة'}</p>
      </div>
      <div className="nf-fit-score personality" data-fit-score="personality">
        <Fingerprint className="nf-score-icon" size={20} strokeWidth={1.5} aria-hidden="true"/>
        <h3>انسجام الشخصية</h3>
        <strong aria-label={personality === null ? personalityUnavailable?'تعذّر التحقق من النتيجة':'بانتظار التقييمين' : undefined}>{personality === null ? <span className="nf-score-pending" aria-hidden="true">—</span> : <>{arabic.format(personality)}<small>٪</small></>}</strong>
        <div className="nf-score-track" aria-hidden="true"><span style={{width:`${personality ?? 0}%`}}/></div>
        <p>{personality === null ? personalityUnavailable?'تعذّر التحقق من النتيجة':'بانتظار اكتمال التقييمين' : 'تشابه أسلوبكما وطباعكما'}</p>
        <button type="button" className="nf-personality-explain" aria-controls={personalityId} onClick={explainPersonality}>{personality===null?'عن هذا التقييم':'لماذا هذه النسبة؟'}<CircleHelp size={15}/></button>
      </div>
    </div>
    <PersonalityAnalysis fit={fit} id={personalityId} panelRef={personalityPanel}/>
    <BeenaSummary fit={fit.beena}/>
    <details className="nf-fit-explanation">
      <summary><CircleHelp size={20} strokeWidth={1.5} aria-hidden="true"/><span>قراءة أعمق لتوافقكما<small>معنى النسب ونقاط الاتفاق والحوار</small></span></summary>
      <div className="nf-fit-explanation-body">
      <p className="nf-fit-limit">ثلاث قراءات مستقلة من إجاباتكما، وليست احتمالًا لنجاح الزواج. تظهر كل نسبة عند اكتمال تقييمها لدى الطرفين. «بيننا» يقارن التصرفات بما يتقبّله كل طرف، وتبقى القصص خارج الحساب.</p>
      <h3 className="nf-fit-reading">توافق التفضيلات · {labels[preference === null ? "insufficient" : fit.band]}</h3>
      <p className="nf-fit-limit">{arabic.format(fit.covered)} من {arabic.format(fit.total)} موضوعًا اكتملت إجاباتكما عنه. تُقارن رغبات كل طرف بإجابات الطرف الآخر مع مراعاة أولوياته.</p>
      {fit.criteria && fit.criteria.total > 0 && <p className="nf-fit-limit">تفضيلات إضافية متاحة للمقارنة: {arabic.format(fit.criteria.covered)} من {arabic.format(fit.criteria.total)}. تُقارن التفاصيل مثل التعليم والعمل والمظهر بما اختاره كل طرف صراحةً؛ لا نفترض أن التشابه أفضل. «لا يهمّني» والإجابة غير المعروفة لا يضيفان نقاطًا.</p>}
      <p className="nf-fit-limit">العمر ومكان الإقامة والشروط الأساسية تحدّد إمكانية الترشيح. «أفضل» تؤثر في ترتيب التوافق عند توفر الإجابة، و«شرط أساسي» يستبعد من لا يستوفيه أو لم يذكره. تبقى اختيارات الشريك الخاصة غير معروضة هنا.</p>
    {(["strengths", "discussion"] as const).map(kind => {
      const topics = [...new Set(fit[kind])].map(topic).filter(value => value !== undefined);
      if (!topics.length) return null;
      return <div className="nf-fit-section" key={kind}><h3>{kind === "strengths" ? <BookOpen size={17} aria-hidden="true"/> : <MessageCircle size={17} aria-hidden="true"/>}
        {kind === "strengths" ? "ما يجمعكما" : "ما يستحق الحديث"}</h3>
        {topics.map(t => <details key={t.id}><summary>{t.title}</summary>
          <p>{kind === "strengths" ? t.reason : t.discussion}</p>
          <small>بُنيت القراءة على سؤالين</small>
          <ul><li>{t.selfPrompt}</li><li>{t.partnerPrompt}</li></ul>
        </details>)}
      </div>;
    })}
    {missing.length > 0 && <details className="nf-fit-missing"><summary><CircleHelp size={16} aria-hidden="true"/> مواضيع لم تكتمل إجاباتها ({arabic.format(missing.length)})</summary>
      <p>{missing.map(t => t.title).join("، ")}</p></details>}
      </div>
    </details>
  </section>;
}
