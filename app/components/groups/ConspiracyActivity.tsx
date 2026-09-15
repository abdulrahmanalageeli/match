import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, ChevronDown, ExternalLink, Eye, MessageCircle, Search, Users } from "lucide-react";
import ActivityArtwork from "./ActivityArtwork";
import { getConspiracyCasesForRound } from "../../lib/event3-conspiracy-cases";
import type { SharedGroupContent } from "../../routes/groups";

const STEPS = ["نصوّت", "نسمع بعض", "نكشف الأدلة", "نراجع رأينا"];
const POSITIONS = ["أميل أصدّق", "ممكن", "ما أقتنع", "ما عندي رأي"];
const EMPTY_NAMES: string[] = [];

function ShowOfHands({ again = false }: { again?: boolean }) {
  return (
    <div className="mt-5 rounded-2xl border border-violet-300/15 bg-violet-400/[0.06] p-4">
      <h3 className="text-sm font-black text-violet-100">{again ? "نفس السؤال… وين واقفين الحين؟" : "قبل ما تسمعون بعض… وين واقفين؟"}</h3>
      <p className="mt-1 text-xs leading-6 text-white/55">فكّروا لحظة، ثم اقرؤوا الخيارات وارفعوا أيديكم عند اختياركم. ما نسجّل اختياراتكم.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2" aria-label="خيارات التصويت برفع الأيدي">
        {POSITIONS.map((position, index) => <li key={position} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs font-bold text-white/85"><span className="text-cyan-200/60">{index + 1}</span>{position}</li>)}
      </ul>
    </div>
  );
}

export default function ConspiracyActivity({ round = 1, participantNames = EMPTY_NAMES, onSharedContentChange, onFinish }: {
  round?: number;
  participantNames?: string[];
  onSharedContentChange?: (content: SharedGroupContent | null) => void;
  onFinish: () => void;
}) {
  const cases = useMemo(() => getConspiracyCasesForRound(round), [round]);
  const [caseIndex, setCaseIndex] = useState(0);
  const [stage, setStage] = useState(0);
  const [complete, setComplete] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const current = cases[caseIndex];
  const names = participantNames.filter(name => name.trim());
  const firstSpeaker = names.length ? names[caseIndex % names.length] : null;

  useEffect(() => { headingRef.current?.focus(); }, [caseIndex, stage, complete]);

  const sharedContent = useMemo<SharedGroupContent>(() => ({
    kind: "activity", activity_id: "conspiracy-theories",
    title: complete ? "تصدّقها ولا لا؟ · وش اكتشفنا؟" : current.title,
    body: complete ? "وش فكرة قالها أحد خلتك تفهم طريقة تفكيره أكثر؟"
      : stage === 0 ? `${current.claim}\nصوّتوا برفع الأيدي: ${POSITIONS.join(" / ")}`
      : stage === 1 ? current.discussion.join("\n")
      : stage === 2 ? `${current.verdict}\n${current.evidence}\n${current.limit}`
      : `صوّتوا مرة ثانية، والمشاركة على راحتكم.\n${current.connection}`,
  }), [current, stage, complete]);

  useEffect(() => { onSharedContentChange?.(sharedContent); }, [onSharedContentChange, sharedContent]);

  function selectCase(index: number) {
    setCaseIndex(index);
    setStage(0);
    setComplete(false);
    if (menuRef.current) menuRef.current.open = false;
  }

  function nextCase() {
    if (caseIndex === cases.length - 1) setComplete(true);
    else selectCase(caseIndex + 1);
  }

  return (
    <section dir="rtl" aria-label="تصدّقها ولا لا؟" className="mx-auto w-full max-w-md space-y-4 pb-4 text-right">
      <header className="event3-activity-heading flex items-center gap-3 rounded-3xl border border-white/10 p-3">
        <ActivityArtwork activityId="conspiracy-theories" className="h-24 w-24 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-cyan-200/70">فضول يجمعنا · حوالي ٦ دقائق للقضية</p>
          <h2 className="mt-1 text-xl font-black text-white">تصدّقها ولا لا؟</h2>
          <p className="mt-1 text-xs leading-6 text-white/55">نسمع الأسباب، نكشف الأدلة، ونعرف بعض أكثر.</p>
        </div>
      </header>

      {!complete && <>
        <details ref={menuRef} className="rounded-2xl border border-white/10 bg-white/[0.025]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-xs font-bold text-white/70">
            <span>القضية {caseIndex + 1} من {cases.length} · {current.category}</span><span className="flex items-center gap-1 text-cyan-200">القضايا <ChevronDown size={14} /></span>
          </summary>
          <div className="grid gap-1 border-t border-white/10 p-2">
            {cases.map((item, index) => <button type="button" key={item.id} onClick={() => selectCase(index)} aria-current={index === caseIndex ? "true" : undefined} className={`min-h-11 rounded-xl px-3 py-2 text-right text-sm font-bold ${index === caseIndex ? "bg-cyan-300/10 text-cyan-100" : "text-white/60 hover:bg-white/5"}`}>{index + 1}. {item.title}</button>)}
          </div>
        </details>
        <ol className="grid grid-cols-4 gap-2" aria-label="مراحل القضية">
          {STEPS.map((label, index) => <li key={label} aria-current={stage === index ? "step" : undefined} className={`text-center text-[10px] font-bold ${stage === index ? "text-cyan-100" : "text-white/40"}`}><div className={`mb-2 h-1 rounded-full ${index <= stage ? "bg-gradient-to-l from-violet-400 to-teal-300" : "bg-white/10"}`} />{label}</li>)}
        </ol>
      </>}

      <div className="activity-panel p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold text-teal-200">
          {complete ? <CheckCircle size={16} /> : stage === 2 ? <Search size={16} /> : stage === 1 ? <MessageCircle size={16} /> : <Eye size={16} />}
          {complete ? "الحلو في الاختلاف إننا نفهم بعض" : STEPS[stage]}
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-black leading-relaxed text-white outline-none">{complete ? "خلصت القضايا… والسالفة توّها تبدأ" : current.title}</h2>

        {complete ? <>
          <p className="mt-4 text-base leading-8 text-white/75">وش فكرة قالها أحد خلتك تفهم طريقة تفكيره أكثر؟ قول له وش لفتك في إجابته.</p>
          <p className="mt-3 text-sm leading-7 text-white/50">مو لازم تتفقون. يكفي تطلعون بفضول أكبر تجاه بعض.</p>
        </> : stage === 0 ? <>
          <p className="mt-3 text-base leading-8 text-white/80">{current.hook}</p>
          <div className="activity-inset mt-4"><p className="text-[10px] font-black text-violet-200">الفكرة المطروحة للنقاش</p><p className="mt-1 text-sm leading-7 text-white/75">{current.claim}</p></div>
          <ShowOfHands />
          <p className="mt-3 text-center text-xs leading-6 text-white/45">خلّوا البحث لبعد النقاش؛ بنعرض المصادر مع الكشف.</p>
        </> : stage === 1 ? <>
          <div className="mt-3 flex items-start gap-2 text-xs leading-6 text-white/60"><Users size={16} className="mt-1 shrink-0 text-cyan-200" /><p>{firstSpeaker ? `ابدؤوا بـ ${firstSpeaker} إذا حاب، ثم أعطوا كل شخص مساحة. التمرير عادي.` : "كل شخص يشارك سببًا واحدًا لموقفه. التمرير عادي، واسألوا بفضول."}</p></div>
          <ol className="mt-4 space-y-3">{current.discussion.map((question, index) => <li key={question} className="activity-inset flex items-start gap-3"><span className="mt-0.5 text-xs font-black text-teal-200/70">{index + 1}</span><p className="text-sm leading-7 text-white/85">{question}</p></li>)}</ol>
          <p className="mt-4 text-xs leading-6 text-white/50">قبل ما ترد على شخص مختلف معك، اسأله: «فهمتك صح إن…؟»</p>
        </> : stage === 2 ? <>
          <div className="mt-4 rounded-2xl border border-teal-300/20 bg-teal-300/[0.07] p-4">
            <h3 className="text-sm font-black text-teal-100">{current.verdict}</h3>
            <p className="mt-2 text-sm leading-8 text-white/80">{current.evidence}</p>
          </div>
          <div className="activity-inset mt-3"><h3 className="text-xs font-black text-violet-200">وش ما يثبته هذا الدليل؟</h3><p className="mt-2 text-sm leading-7 text-white/65">{current.limit}</p></div>
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="mb-2 text-[10px] font-bold text-white/40">المصادر · المحتوى مراجع في سبتمبر ٢٠٢٦</p>
            {current.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 py-2 text-xs leading-6 text-cyan-200 underline decoration-cyan-300/25 underline-offset-4 hover:text-white"><span>{source.title}</span><ExternalLink size={14} className="shrink-0" /><span className="sr-only">يفتح في نافذة جديدة</span></a>)}
          </div>
        </> : <>
          <ShowOfHands again />
          <p className="mt-4 text-sm leading-7 text-white/70">اللي غيّر رأيه يقول وش أثّر فيه، واللي بقي على رأيه يقول وش الدليل اللي يحتاجه. عادي يبقى عندك سؤال.</p>
          <div className="activity-inset mt-4"><p className="mb-2 text-[10px] font-black text-teal-200">نرجع لبعض</p><p className="text-base leading-8 text-white/90">{current.connection}</p></div>
        </>}
      </div>

      <div className="space-y-2">
        <button type="button" onClick={() => complete ? onFinish() : stage < 3 ? setStage(stage + 1) : nextCase()} className="event3-art-action activity-primary">
          {complete ? "العودة للأنشطة" : ["صوّتنا — نسمع بعض", "نكشف اللي نعرفه", "نصوّت مرة ثانية", caseIndex === cases.length - 1 ? "نختم السالفة" : "قضية جديدة"][stage]}<ArrowLeft size={17} />
        </button>
        <div className="flex gap-2">
          {!complete && stage > 0 && <button type="button" onClick={() => setStage(stage - 1)} className="activity-secondary"><ArrowRight size={15} /> رجوع</button>}
          <button type="button" onClick={() => complete ? selectCase(0) : nextCase()} className="activity-secondary">{complete ? "نرجع للقضايا" : "نتخطّى هالقضية"}</button>
        </div>
      </div>
      <p className="text-center text-[11px] leading-6 text-white/40">المشاركة على راحتكم · ما فيه نقاط ولا فائز</p>
    </section>
  );
}
