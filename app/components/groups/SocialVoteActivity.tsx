import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Check, CheckCircle, Flag, Hand, HelpCircle, Lock, Smartphone, Users, X } from "lucide-react";
import ActivityArtwork from "./ActivityArtwork";
import { getSocialVotePrompts, summarizeSocialVotes, type SocialVoteActivityId } from "../../lib/event3-social-votes";
import type { SharedGroupContent } from "../../routes/groups";

const EMPTY_NAMES: string[] = [];
const FLAG_CHOICES = ["أخضر", "أحمر", "يعتمد"];
const RULE_CHOICES = ["أتفق", "أختلف"];
const numberAr = (value: number) => value.toLocaleString("ar-SA");

export default function SocialVoteActivity({ activityId, round = 1, participantNames = EMPTY_NAMES, rulebook, onRulebookChange, onSharedContentChange, onFinish }: {
  activityId: SocialVoteActivityId;
  round?: number;
  participantNames?: string[];
  rulebook: string[];
  onRulebookChange: (rules: string[]) => void;
  onSharedContentChange?: (content: SharedGroupContent | null) => void;
  onFinish: () => void;
}) {
  const isRules = activityId === "unwritten-rules";
  const title = isRules ? "قوانيننا غير المكتوبة" : "أخضر، أحمر، أو يعتمد؟";
  const choices = isRules ? RULE_CHOICES : FLAG_CHOICES;
  const prompts = useMemo(() => getSocialVotePrompts(activityId, round), [activityId, round]);
  const [names] = useState(() => participantNames.map(name => name.trim()).filter(Boolean));
  const [playerCount, setPlayerCount] = useState(names.length || 4);
  const [mode, setMode] = useState<"physical" | "digital">("digital");
  const isPhysical = mode === "physical";
  const [stage, setStage] = useState<"setup" | "physical" | "handoff" | "vote" | "reveal" | "complete">("setup");
  const [promptIndex, setPromptIndex] = useState(0);
  const [votes, setVotes] = useState<(string | null)[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [promptTitle, statement, discussion] = prompts[promptIndex];
  const results = summarizeSocialVotes(votes, choices);
  const resultText = results.map(result => `${result.choice}: ${numberAr(result.count)}`).join(" · ");
  const skipped = votes.filter(vote => vote === null).length;
  const player = names[votes.length] || `المشارك ${numberAr(votes.length + 1)}`;
  const saved = rulebook.includes(statement);
  const physicalInstructions = "خلّوا الهاتف مع المنسّق. كل شخص يختار رأيه، وبعد العد إلى ثلاثة تكشفون آراءكم بالأصابع أو بالكلام. المشاركة اختيارية، والأصوات ما تتسجّل.";
  const sharedBody = stage === "complete"
    ? isRules ? `قوانين اخترناها مع بعض:\n${rulebook.length ? rulebook.join("\n") : "ما أضفنا قوانين بعد؛ الاختلاف يفتح السالفة."}` : "وش موقف اختلفتوا عليه، ووش سبب خلاكم تشوفونه بشكل جديد؟"
    : stage === "reveal"
      ? `${statement}${isPhysical ? "" : `\n${resultText}`}${!isPhysical && skipped ? `\nتجاوزوا السؤال: ${numberAr(skipped)}` : ""}\n${discussion}${isRules && saved ? "\nأضفناها لقوانيننا." : ""}`
      : isPhysical
        ? `${statement}\n${physicalInstructions}\n${choices.map((label, index) => `${numberAr(index + 1)}: ${label}`).join(" · ")}`
        : `${statement}\nمرّروا هاتف المنسّق للتصويت. الاختيارات مخفية حتى يخلص الجميع. نحكم على الموقف، والمشاركة اختيارية.`;

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [stage, promptIndex, votes.length]);
  useEffect(() => {
    onSharedContentChange?.({ kind: "activity", activity_id: activityId, title, body: sharedBody });
  }, [activityId, title, sharedBody, onSharedContentChange]);

  function submitVote(value: string | null) {
    const next = [...votes, value];
    setVotes(next);
    setChoice(null);
    setStage(next.length === playerCount ? "reveal" : "handoff");
  }

  function nextPrompt() {
    if (promptIndex === prompts.length - 1) { setStage("complete"); return; }
    setPromptIndex(index => index + 1);
    setVotes([]);
    setChoice(null);
    setStage(isPhysical ? "physical" : "handoff");
  }

  return (
    <section dir="rtl" aria-label={title} className="mx-auto w-full max-w-md space-y-4 pb-4 text-right">
      <header className="event3-activity-heading flex items-center gap-3 rounded-3xl border border-white/10 p-3">
        <ActivityArtwork activityId={activityId} className="h-24 w-24 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-cyan-200/70">آراء مختلفة · سوالف تجمعنا</p>
          <h1 className="mt-1 text-xl font-black text-white">{title}</h1>
          <p className="mt-1 text-xs leading-6 text-white/55">{isRules ? "نتناقش، ونكتب القواعد اللي تشبهنا." : "موقف واحد… وكل شخص يشوفه بطريقة."}</p>
        </div>
      </header>

      {stage !== "setup" && stage !== "complete" && <>
        <div className="flex items-center justify-between text-xs font-bold text-white/55"><span>الموقف {numberAr(promptIndex + 1)} من {numberAr(prompts.length)}</span><span>{stage === "reveal" ? "انكشفت الآراء" : isPhysical ? "تصويت حضوري" : "التصويت مخفي"}</span></div>
        <ol className="grid grid-cols-3 gap-2" aria-label="خطوات النشاط">
          {["نختار", "نكشف", "نتناقش"].map((label, index) => <li key={label} className={`text-center text-[11px] font-bold ${stage === "reveal" || index === 0 ? "text-cyan-100" : "text-white/40"}`}><div className={`mb-2 h-1 rounded-full ${stage === "reveal" || index === 0 ? "bg-gradient-to-l from-violet-400 to-teal-300" : "bg-white/10"}`} />{label}</li>)}
        </ol>
      </>}

      <div className="activity-panel space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] font-bold text-teal-200">{isRules ? <BookOpen size={16} /> : <Flag size={16} />}{stage === "complete" ? "وش أخذنا من السالفة؟" : stage === "setup" ? "اختاروا طريقة اللعب" : promptTitle}</div>
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-black leading-relaxed text-white outline-none sm:text-2xl">{stage === "setup" ? "نختلف؟ هنا تبدأ السالفة" : stage === "complete" ? isRules ? "هذا دفتر قوانينكم" : "الاختلاف عرّفنا على بعض" : statement}</h2>

        {stage === "setup" ? <>
          <div className="grid gap-2" role="group" aria-label="طريقة اللعب">
            {([
              { value: "physical", label: "حضوري · بدون تمرير الهاتف", description: "نختار بالأصابع أو بالكلام، والهاتف يبقى مع المنسّق.", Icon: Hand },
              { value: "digital", label: "رقمي · نمرّر هاتف واحد", description: "كل شخص يصوّت بسرّية على الهاتف، ثم نكشف الأعداد.", Icon: Smartphone },
            ] as const).map(({ value, label, description, Icon }) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`flex min-h-20 items-start gap-3 rounded-2xl border p-4 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${mode === value ? "border-cyan-200/60 bg-cyan-300/15" : "border-white/10 bg-white/[0.025] hover:bg-white/5"}`}><Icon size={21} className="mt-0.5 shrink-0 text-cyan-200" /><span className="min-w-0"><span className="block text-sm font-bold text-white">{label}</span><span className="mt-1 block text-xs leading-6 text-white/60">{description}</span></span>{mode === value && <CheckCircle size={18} className="mr-auto mt-0.5 shrink-0 text-cyan-200" />}</button>)}
          </div>
          <p className="text-sm leading-7 text-white/75">{isPhysical ? physicalInstructions : "مرّروا الهاتف بالدور. كل شخص يختار رأيه بسرّية، وبعد آخر تصويت تنكشف الأعداد بدون أسماء. اسمعوا الأسباب، وعادي تتجاوزون أي سؤال."}</p>
          <div className="flex flex-wrap gap-2">{choices.map(label => <span key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-cyan-100">{label}</span>)}</div>
          <p className="text-xs leading-6 text-white/55">{isRules ? "بعد النقاش، أضيفوا القاعدة للدفتر إذا وافق الجميع. ما نضيفها تلقائياً بالأغلبية." : "أخضر: يعجبني · أحمر: ما يناسبني · يعتمد: السياق يفرق. نتكلم عن التصرف، مو عن أشخاص في المجموعة."}</p>
          {!isPhysical && (names.length ? <p className="flex items-center gap-2 text-sm text-teal-100"><Users size={17} /> {numberAr(names.length)} مشاركين · الأسماء تحدد الدور فقط</p> : <label className="flex items-center justify-between gap-3 text-sm font-bold text-white/80">عدد المشاركين<select value={playerCount} onChange={event => setPlayerCount(Number(event.target.value))} className="min-h-11 rounded-xl border border-white/15 bg-gray-950 px-4 text-white focus-visible:ring-2 focus-visible:ring-teal-200">{Array.from({ length: 11 }, (_, index) => index + 2).map(count => <option key={count} value={count}>{numberAr(count)}</option>)}</select></label>)}
          <p className="text-xs leading-6 text-white/45">٣٠ موقف · جرّبوا ٣–٥ مواقف في حوالي ٨ دقائق، وكمّلوا على راحتكم.</p>
          <button type="button" className="event3-art-action activity-primary w-full" onClick={() => setStage(isPhysical ? "physical" : "handoff")}>{isPhysical ? "نبدأ حضوريًا" : "نبدأ التصويت"} <ArrowLeft size={17} /></button>
        </> : stage === "physical" ? <>
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4"><p className="flex items-center gap-2 text-sm font-bold text-cyan-100"><Hand size={20} /> نختار، ثم نكشف مع بعض</p><p className="mt-2 text-sm leading-7 text-white/75">{physicalInstructions}</p></div>
          <div className="grid gap-2" aria-label="إشارات التصويت">{choices.map((label, index) => <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-lg font-black text-cyan-100">{numberAr(index + 1)}</span><span className="text-sm font-bold text-white">{label}</span></div>)}</div>
          <p className="text-xs leading-6 text-white/55">ارفعوا عدد الأصابع المقابل لرأيكم، أو قولوا اختياركم. عادي أحد يتجاوز بدون تبرير.</p>
          <button type="button" className="event3-art-action activity-primary w-full" onClick={() => setStage("reveal")}>كشفنا آراءنا · نناقش <ArrowLeft size={17} /></button>
          <button type="button" className="activity-secondary w-full" onClick={nextPrompt}>نتجاوز الموقف</button>
        </> : stage === "handoff" ? <>
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4 text-center"><Lock className="mx-auto mb-2 text-cyan-200" size={24} /><p className="text-xs text-white/50">مرّروا الهاتف إلى</p><p className="mt-2 break-words text-xl font-black text-white">{player}</p><p className="mt-2 text-xs text-white/50">الدور {numberAr(votes.length + 1)} من {numberAr(playerCount)}</p></div>
          <button type="button" className="event3-art-action activity-primary w-full" onClick={() => setStage("vote")}>الهاتف معي · أختار رأيي</button>
        </> : stage === "vote" ? <>
          <p className="text-xs leading-6 text-white/55">اختَر رأيك ثم أكّد. ما يبان اختيارك للشخص اللي بعدك.</p>
          <div className="grid gap-2" role="group" aria-label="رأيك في الموقف">{choices.map((label, index) => {
            const Icon = isRules ? index === 0 ? Check : X : index === 2 ? HelpCircle : Flag;
            const accent = index === 0 ? "text-emerald-200" : index === 1 ? "text-rose-200" : "text-amber-200";
            return <button type="button" key={label} aria-pressed={choice === label} onClick={() => setChoice(label)} className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-right text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${choice === label ? "border-cyan-200/60 bg-cyan-300/15" : "border-white/10 bg-white/[0.025] hover:bg-white/5"} ${accent}`}><Icon size={21} />{label}{choice === label && <CheckCircle className="mr-auto" size={18} />}</button>;
          })}</div>
          <button type="button" className="event3-art-action activity-primary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={choice === null} onClick={() => submitVote(choice)}>تأكيد اختياري <Lock size={16} /></button>
          <button type="button" className="activity-secondary w-full" onClick={() => submitVote(null)}>أتجاوز السؤال</button>
        </> : stage === "reveal" ? <>
          {!isPhysical && <div className="space-y-3" aria-label="نتائج التصويت">{results.map(({ choice: label, count }) => <div key={label}><div className="mb-2 flex items-center justify-between text-sm font-bold text-white/85"><span>{label}</span><span>{numberAr(count)} من {numberAr(playerCount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-l from-violet-400 via-cyan-400 to-teal-300" style={{ width: `${count / playerCount * 100}%` }} /></div></div>)}</div>}
          {!isPhysical && skipped > 0 && <p className="text-xs text-white/50">تجاوزوا السؤال: {numberAr(skipped)} · ما ينحسب كتصويت</p>}
          <div className="rounded-2xl border border-teal-300/15 bg-teal-300/5 p-4"><p className="mb-2 text-[11px] font-bold text-teal-200">{isPhysical ? "كل رأي له مساحة · نسمع السبب" : "نسمع السبب، بدون ما نخمن مين صوّت"}</p><p className="text-base font-bold leading-7 text-white">{discussion}</p><p className="mt-2 text-xs leading-6 text-white/55">{isRules ? "هل تصلح قاعدة لكم؟ اسمعوا المختلف، واتفقوا قبل إضافتها." : "اللي اختار «يعتمد»: وش التفصيلة اللي ممكن تغيّر رأيك؟ المشاركة على راحتكم."}</p></div>
          {isRules && <button type="button" aria-pressed={saved} className="activity-secondary w-full" onClick={() => onRulebookChange(saved ? rulebook.filter(rule => rule !== statement) : [...rulebook, statement])}>{saved ? <CheckCircle size={17} /> : <BookOpen size={17} />}{saved ? "أضفناها · تراجع عن الإضافة" : "اتفقنا كلنا · نضيفها لقوانيننا"}</button>}
          <button type="button" className="event3-art-action activity-primary w-full" onClick={nextPrompt}>{promptIndex === prompts.length - 1 ? "نشوف الخلاصة" : "الموقف التالي"}<ArrowLeft size={17} /></button>
          <button type="button" className="activity-secondary w-full" onClick={() => setStage("complete")}>نكتفي هنا · الخلاصة</button>
        </> : <>
          <p className="text-sm leading-7 text-white/70">{isRules ? "قواعد اخترتوها بعد ما سمعتوا بعض. تقدرون تراجعونها وتحذفون أي قاعدة ما عادت تناسبكم." : "وش سبب سمعته خلاك تشوف موقف عادي بطريقة جديدة؟"}</p>
          {!isRules && <p className="text-xs leading-6 text-white/50">ما فيه إجابة نموذجية. الحلو إنكم عرفتوا كيف يفكّر كل واحد.</p>}
          {isRules && <p className="text-xs leading-6 text-white/50">الدفتر يبقى معكم أثناء فتح صفحة الأنشطة. خذوا لقطة شاشة إذا تبغون تحتفظون فيه بعد إغلاقها.</p>}
          {promptIndex < prompts.length - 1 && <button type="button" className="event3-art-action activity-primary w-full" onClick={nextPrompt}>نكمّل بموقف جديد <ArrowLeft size={17} /></button>}
        </>}
      </div>

      {isRules && (stage === "reveal" || stage === "complete" || stage === "setup") && <div className="activity-panel p-5"><h3 className="mb-3 flex items-center gap-2 text-sm font-black text-teal-100"><BookOpen size={17} />قوانيننا · {numberAr(rulebook.length)}</h3>{rulebook.length ? <ol className="space-y-3">{rulebook.map((rule, index) => <li key={rule} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3"><span className="mt-1 text-xs font-bold text-cyan-200">{numberAr(index + 1)}.</span><span className="flex-1 text-sm leading-7 text-white/85">{rule}</span><button type="button" aria-label={`حذف القاعدة: ${rule}`} onClick={() => onRulebookChange(rulebook.filter(item => item !== rule))} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-teal-200"><X size={16} /></button></li>)}</ol> : <p className="text-sm leading-7 text-white/50">ما أضفنا قوانين بعد. مو لازم تتفقون على كل شيء.</p>}</div>}
      {(stage === "setup" || stage === "complete") && <button type="button" className="activity-secondary w-full" onClick={onFinish}>نرجع للأنشطة</button>}
    </section>
  );
}
