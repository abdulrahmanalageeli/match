import { useId, useRef } from "react";
import { CircleHelp, Fingerprint, SlidersHorizontal } from "lucide-react";
import { dimensions, preferencePercentage, personalityPercentage, type MatchFit } from "./model";
export { preferencePercentage, personalityPercentage } from "./model";
import { PersonalityAnalysis } from "./PersonalityAnalysis";
import { PreferenceInsights } from "./PreferenceInsights";
import { BeenaSummary } from "../beena/BeenaSummary";
import "./fit.css";

const arabic = new Intl.NumberFormat("ar-SA", { numberingSystem: "arab" });
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
  const preferenceId=useId();
  const personalityPanel=useRef<HTMLDetailsElement>(null);
  const preferencePanel=useRef<HTMLDivElement>(null);
  if (!["marriage-v1", "marriage-v2"].includes(fit.version)) return null;
  const preference = preferencePercentage(fit);
  const personality = personalityPercentage(fit);
  const personalityUnavailable=personality===null&&fit.personality?.complete===true;
  function explainPreferences(){
    const panel=preferencePanel.current;if(!panel)return;
    panel.focus({preventScroll:true});
    const reduced=document.documentElement.dataset.nfMotion==='reduced'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({behavior:reduced?'instant':'smooth',block:'start'});
  }
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
        <button type="button" className="nf-personality-explain" aria-controls={preferenceId} onClick={explainPreferences}>{preference===null?'قراءة الإجابات المتاحة':'لماذا هذه النسبة؟'}<CircleHelp size={15}/></button>
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
    <div id={preferenceId} ref={preferencePanel} tabIndex={-1} className="nf-preference-panel" aria-label="أسباب توافق التفضيلات"><PreferenceInsights fit={fit}/></div>
    <PersonalityAnalysis fit={fit} id={personalityId} panelRef={personalityPanel}/>
    <BeenaSummary fit={fit.beena}/>
    <p className="nf-fit-boundary">ثلاث قراءات مستقلة من إجاباتكما، وليست احتمالًا لنجاح الزواج. تظهر كل نسبة عند اكتمال تقييمها لدى الطرفين.</p>
  </section>;
}
