import ActivityArtwork from "./ActivityArtwork";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle, Clock, Heart, Lightbulb, Pause, Play, RefreshCw, Shuffle, Sparkles, Users, Zap } from "lucide-react";
import type { SharedGroupContent } from "../../routes/groups";

const PRIORITY_SCENARIO_COUNT = 16;

const SCENARIOS = [
  {
    "title": "صندوق للمستقبل",
    "setting": "عندكم صندوق تتركونه لأنفسكم بعد عشر سنوات. وش يستحق ينحفظ فيه؟",
    "choices": [
      "شيء من يومنا",
      "ذكرى مشتركة",
      "رسالة للمستقبل"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "اختاروا خمسة أشياء تمثّل حياتكم اليوم داخل صندوق يُفتح بعد عشر سنوات، واتفقوا على رسالة ترافقها.",
    "twist": "الصندوق بحجم علبة أحذية ولا يسمح بأي جهاز إلكتروني.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "هدية من المجموعة",
    "setting": "بتقدّمون هدية مشتركة لصديق، وميزانيتكم كلها ١٢٠ ريالًا.",
    "choices": [
      "تجربة نشاركها",
      "شيء نصنعه",
      "تفصيلة يحبها"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "صمّموا هدية مشتركة لصديق بميزانية ١٢٠ ريالًا؛ حدّدوا الفكرة ومساهمة كل شخص.",
    "twist": "الصديق يفضّل ألّا تصله أي أغراض جديدة للبيت.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "ركن تبادل الكتب",
    "setting": "مقهى الحي أعطاكم رفًا صغيرًا لتبادل الكتب بين الزوار.",
    "choices": [
      "اختيار الكتب",
      "طريقة الاستعارة",
      "تشجيع الإرجاع"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "عندكم رف في مقهى، واتفقوا على طريقة اختيار الكتب واستعارتها وإرجاعها.",
    "twist": "ممنوع التسجيل بالأسماء أو أخذ أرقام التواصل.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "غرفة استراحة",
    "setting": "عندكم غرفة صغيرة يحتاجها ناس للقراءة وناس للسوالف.",
    "choices": [
      "مكان للقراءة",
      "جلسة للسوالف",
      "قاعدة مشتركة"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "صمّموا غرفة صغيرة يستخدمها أشخاص للقراءة والحديث؛ اختاروا الأثاث وقاعدة الاستخدام.",
    "twist": "لا يمكن تقسيم الغرفة بحاجز أو إضافة غرفة ثانية.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "وجبة تجمعنا",
    "setting": "بتحضّرون وجبة مع بعض، وكل شخص يشارك في تجهيزها.",
    "choices": [
      "اختيار الأطباق",
      "توزيع المهام",
      "وقت التحضير"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "خطّطوا لوجبة واحدة تحضّرونها معًا؛ وزّعوا المهام وحدّدوا ثلاثة أطباق.",
    "twist": "الفرن تعطل، ولا يمكن شراء وجبة جاهزة.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "دليل أهل الحي",
    "setting": "شخص انتقل لحيّكم ويحتاج دليلًا مختصرًا من أهل المكان.",
    "choices": [
      "معلومة يومية",
      "مكان مفيد",
      "طريقة عرض واضحة"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "اختاروا خمس معلومات نافعة لشخص انتقل حديثًا لحيّكم ورتّبوها في صفحة.",
    "twist": "يجب أن يفهمها شخص لا يقرأ العربية.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "تبادل مهارات",
    "setting": "عندكم ساعة تتبادلون فيها مهاراتكم، وكل شخص يعلّم ويتعلّم.",
    "choices": [
      "مهارة بسيطة",
      "تجربة باليد",
      "توزيع الوقت"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "صمّموا ساعة يتعلم فيها كل شخص شيئًا من غيره؛ اتفقوا على التقسيم والأدوات.",
    "twist": "لا شاشات ولا شراء أدوات، والموجود ورق وأقلام فقط.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "فيلمنا القصير",
    "setting": "بتصوّرون فيلمًا قصيرًا مدته دقيقة واحدة بهاتفكم.",
    "choices": [
      "بداية تشد",
      "نهاية مفاجئة",
      "دور لكل شخص"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "اتفقوا على قصة فيلم من دقيقة، ونهايته، وأدوار التصوير والتمثيل.",
    "twist": "الفيلم صامت بالكامل ومسموح بمكان تصوير واحد.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "إصلاح بدل الرمي",
    "setting": "عندكم غرض منزلي تعطّل، وودّكم تعطونه فرصة ثانية.",
    "choices": [
      "إصلاح العطل",
      "تغيير الشكل",
      "استخدام مختلف"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "اختاروا غرضًا منزليًا بسيطًا يستحق الإصلاح وحدّدوا خطة وأدوارًا.",
    "twist": "قطعة الاستبدال غير متوفرة؛ المطلوب استخدام جديد للغرض.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "قائمة موسيقية مشتركة",
    "setting": "قدامكم مشوار قصير وتبغون قائمة موسيقية تناسب أذواقكم المختلفة.",
    "choices": [
      "بداية المشوار",
      "تنويع الأذواق",
      "طريقة الاختيار"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "صمّموا قائمة من خمس مقطوعات لمشوار قصير، واتفقوا على طريقة تعطي الأذواق المختلفة فرصة.",
    "twist": "لا يسمح بتكرار الفنان نفسه، وأحد الركّاب يفضّل المقاطع بلا غناء.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "متحف الأشياء العادية",
    "setting": "بتسوّون معرضًا صغيرًا يخلّي الناس يشوفون الأشياء اليومية بنظرة جديدة.",
    "choices": [
      "غرض مألوف",
      "قصة غير متوقعة",
      "رابط بين الأشياء"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "كل شخص يقترح غرضًا يوميًا، واتفقوا على ثلاثة معروضات وقصة تربط بينها.",
    "twist": "الزوار أطفال، وكل شرح لا يتجاوز عشر كلمات.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "نشرة أخبار حلوة",
    "setting": "ودّكم ترسلون نشرة أسبوعية صغيرة فيها أخبار حلوة من محيطكم.",
    "choices": [
      "قصة من الحي",
      "إنجاز صغير",
      "تجربة نافعة"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "صمّموا رسالة أسبوعية فيها ثلاثة أنواع من الأخبار الإيجابية، وحدّدوا من يجمع ويراجع ويختار.",
    "twist": "الأخبار يجب أن تكون من تجاربكم المباشرة، دون نسخ أخبار الإنترنت.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "لعبة من اختراعنا",
    "setting": "عندكم ورق وأقلام وخمس دقائق للعبة من اختراعكم.",
    "choices": [
      "قاعدة سهلة",
      "دور للجميع",
      "نهاية واضحة"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "ابتكروا لعبة مدتها خمس دقائق باستخدام الورق والأقلام، وحدّدوا قواعدها ونهايتها.",
    "twist": "يجب أن تنجح أيضًا إذا وصل لاعب جديد في منتصفها.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "مقعد للجميع",
    "setting": "عندكم زاوية صغيرة في حديقة، وتبغونها تكون مريحة لمستخدمين مختلفين.",
    "choices": [
      "راحة الجلوس",
      "سهولة الوصول",
      "استخدام المساحة"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "صمّموا زاوية جلوس صغيرة في حديقة، وحدّدوا ثلاث إضافات تخدم مستخدمين مختلفين.",
    "twist": "يجب ترك ممر واسع لعربة أطفال أو كرسي متحرك دون زيادة المساحة.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "جولة تصوير",
    "setting": "بتحكون قصة عن الحي باستخدام ثلاث صور فقط.",
    "choices": [
      "تفصيلة صغيرة",
      "حركة المكان",
      "قصة بين اللقطات"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "اتفقوا على موضوع وثلاث لقطات تحكون بها قصة عن الحي.",
    "twist": "ممنوع تصوير وجوه الأشخاص أو أسماء المحلات.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },
  {
    "title": "طقس أسبوعي",
    "setting": "ودّكم تبدأون عادة جماعية قصيرة وتستمرون عليها شهرًا.",
    "choices": [
      "موعد مناسب",
      "مشاركة بسيطة",
      "استمرار سهل"
    ],
    "question": "وش أولويتك هنا، وليش؟",
    "goal": "ابتكروا عادة جماعية قصيرة يمكن استمرارها شهرًا، وحدّدوا موعدها وكيف يشارك كل شخص.",
    "twist": "بعضكم في مدينة ثانية، ولا يوجد وقت يناسب الجميع للاتصال المباشر.",
    "reflection": "وش فكرة من غيرك حسّنت الخطة؟"
  },

  {
    title: "أمسية على ذوقنا",
    setting: "عندكم أمسية فاضية وثلاث ساعات تقضونها مع بعض. صمّموا طلعة فيها شيء يناسب كل شخص.",
    choices: ["شيء فيه حركة", "جلسة هادئة", "تجربة جديدة"],
    question: "وش ودّك يكون في الطلعة؟ وليه؟",
    goal: "اتفقوا على المكان، وأول شيء بتسوّونه، وكيف تعطون كل شخص مساحة يستمتع.",
    twist: "بدأ المطر، وصار عندكم ساعة واحدة بس. كيف تغيّرون الخطة وتخلّون فيها شيء للجميع؟",
  },
  {
    title: "ضيف في مدينتنا",
    setting: "صديق يزور مدينتكم لأول مرة، وعندكم نصف يوم تخلّونه يعيش تجربة تستاهل تنحكي.",
    choices: ["مكان له قصة", "أكلة تستاهل", "شيء غير متوقّع"],
    question: "وش تجربة ودّك تضيفها؟ وش اللي يخليها مميّزة عندك؟",
    goal: "اختاروا ثلاث محطات، ورتّبوها مع بعض. خذوا من اقتراحات الجميع، حتى لو بفكرة صغيرة.",
    twist: "ضيفكم يقول: «أبي أعيش يومكم العادي، بعيد عن الأماكن المشهورة». كيف تعيدون ترتيب اليوم؟",
  },
  {
    title: "جمعتنا الأولى",
    setting: "قررتوا تسوّون جمعة بسيطة لأصدقاء ما يعرفون بعض. خطّطوا لبداية تخلّي الجميع يرتاح.",
    choices: ["بداية تكسر الرسميات", "مساحة للهدوء", "لحظة تجمع الكل"],
    question: "وش الشيء اللي يخليك ترتاح في جمعة جديدة؟",
    goal: "اتفقوا على أول نصف ساعة: كيف تستقبلون الناس، وش تسوّون، وكيف يدخل الهادئ في الجو على راحته.",
    twist: "وصل ضعف العدد اللي توقّعتوه، وبعضهم ما يحب الألعاب. كيف تخلّون الجمعة مريحة للجميع؟",
  },
];

function getScenariosForRound(round: number) {
  const offset = Math.max(0, round - 1) % PRIORITY_SCENARIO_COUNT;
  return [
    ...SCENARIOS.slice(offset, PRIORITY_SCENARIO_COUNT),
    ...SCENARIOS.slice(0, offset),
    ...SCENARIOS.slice(PRIORITY_SCENARIO_COUNT),
  ];
}

const STEPS = [
  { label: "نفكّر", title: "لحظة لكل واحد", seconds: 20, Icon: Lightbulb, cue: "فكّروا بهدوء قبل ما تسمعون اقتراحات البقية. ما تحتاجون تكتبون شيء." },
  { label: "نسمع", title: "نسمع من الجميع", seconds: 20, Icon: Users, cue: "كل شخص يشارك رغبته والسبب باختصار. اسمعوا بدون مقاطعة؛ التمرير عادي." },
  { label: "نتفق", title: "خلّونا نبني الخطة", seconds: 180, Icon: Heart, cue: "ابدؤوا بالمشترك، وخلّوا الاختلاف يضيف للخطة. مو لازم تكون فكرتك هي اللي تمشي." },
  { label: "نغيّر", title: "لحظة… تغيّرت الخطة!", seconds: 60, Icon: Zap, cue: "خذوا التغيير بروح خفيفة، وعدّلوا خطتكم مع بعض." },
  { label: "نكتشف", title: "وش اكتشفتوا؟", seconds: 60, Icon: Sparkles, cue: "سؤال أخير، وإجابة على راحتكم. خذوا السالفة أبعد إذا ودّكم." },
];
const EMPTY_NAMES: string[] = [];
const numberAr = (value: number) => value.toLocaleString("ar-SA");

export default function LetsAgreeActivity({ round = 1, participantNames = EMPTY_NAMES, onSharedContentChange, onFinish }: {
  round?: number;
  participantNames?: string[];
  onSharedContentChange?: (content: SharedGroupContent | null) => void;
  onFinish: () => void;
}) {
  const scenarioOrder = useMemo(() => getScenariosForRound(round), [round]);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stage, setStage] = useState(-1);
  const [speaker, setSpeaker] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Freeze the speaking order for this play-through; duplicate first names are valid.
  const [names] = useState(() => participantNames.map(name => name.trim()).filter(Boolean));
  const scenario = scenarioOrder[scenarioIndex];
  const step = STEPS[stage];
  const complete = stage === STEPS.length;
  const speakerName = names[speaker];
  const duration = stage === 1 && names.length === 0 ? 120 : (step?.seconds ?? 0);
  const running = deadline !== null;
  const StepIcon = step?.Icon || Heart;
  const prompt = stage <= 1 ? scenario.question
    : stage === 2 ? scenario.goal
    : stage === 3 ? scenario.twist
    : scenario.reflection || "وش اقتراح من غيرك غيّر خطتك؟ ووش أعجبك فيه؟";

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) setDeadline(null);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [deadline]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, [stage, speaker]);

  const sharedContent = useMemo<SharedGroupContent>(() => ({
    kind: "activity",
    activity_id: "lets-agree",
    title: complete ? "خلّونا نتفق · اكتشفنا بعض أكثر" : `خلّونا نتفق · ${step?.title || scenario.title}`,
    body: complete
      ? "خذوا معكم فكرة عجبتكم من شخص آخر، وخلّوا السالفة تكمل."
      : stage === -1
        ? `${scenario.setting}\nنفكّر، نسمع من الجميع، نبني خطة، ثم نجرّب تغييراً مفاجئاً. المشاركة على راحتكم.`
        : `${scenario.setting}\n${stage === 1 && speakerName ? `الدور الآن: ${speakerName}\n` : ""}${prompt}\n${step.cue}`,
  }), [complete, step, scenario, stage, speakerName, prompt]);

  useEffect(() => {
    onSharedContentChange?.(sharedContent);
  }, [onSharedContentChange, sharedContent]);

  function enterStage(next: number) {
    const nextSeconds = next === 1 && names.length === 0 ? 120 : (STEPS[next]?.seconds ?? 0);
    setStage(next);
    setSpeaker(0);
    setSeconds(nextSeconds);
    setDeadline(nextSeconds > 0 ? Date.now() + nextSeconds * 1000 : null);
  }

  function advance() {
    if (stage === 1 && speaker < names.length - 1) {
      setSpeaker(current => current + 1);
      setSeconds(STEPS[1].seconds);
      setDeadline(Date.now() + STEPS[1].seconds * 1000);
    } else enterStage(stage + 1);
  }

  function toggleTimer() {
    if (deadline !== null) {
      setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      setDeadline(null);
    } else if (seconds > 0) setDeadline(Date.now() + seconds * 1000);
  }

  const primaryButton = "event3-art-action event3-action flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-teal-400 to-emerald-400 px-4 py-3 text-sm font-black text-gray-950 shadow-[0_10px_30px_-12px_rgba(45,212,191,.45)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950";

  return (
    <section dir="rtl" aria-label="خلّونا نتفق" className="mx-auto w-full max-w-md text-right">
      <div className="event3-activity-heading mb-4 flex items-center gap-3 rounded-3xl border border-white/10 p-3">
        <ActivityArtwork activityId="lets-agree" className="h-24 w-24 shrink-0" />
        <div>
          <p className="mb-1 text-[10px] font-bold text-cyan-200/70">النشاط الآن</p>
          <h1 className="text-xl font-black text-white">خلّونا نتفق</h1>
          <span className="mt-2 flex items-center gap-1.5 text-xs text-white/55"><Clock size={13} /> حوالي ٧ دقائق</span>
        </div>
      </div>

      <ol aria-label="خطوات النشاط" className="mb-4 grid grid-cols-5 gap-1.5">
        {STEPS.map((item, index) => (
          <li key={item.label} aria-current={index === stage ? "step" : undefined} className="min-w-0 text-center">
            <div className={`mb-2 h-1 rounded-full ${index <= stage ? "bg-teal-300" : "bg-white/10"}`} />
            <span className={`text-[11px] font-bold ${index === stage ? "text-teal-200" : index < stage ? "text-white/70" : "text-white/40"}`}>{item.label}</span>
          </li>
        ))}
      </ol>

      <div className="relative overflow-hidden rounded-[1.75rem] border border-teal-300/20 bg-gradient-to-br from-teal-900/35 via-gray-900/90 to-gray-950 p-5 shadow-[0_24px_70px_-35px_rgba(0,0,0,.8)] sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 h-52 w-52 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="relative">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="rounded-full border border-teal-300/15 bg-teal-300/10 px-3 py-1.5 text-[11px] font-bold text-teal-100">
              {complete ? "فكرة من كل واحد" : stage === -1 ? "تحدّي واحد · خطة تجمعكم" : `الخطوة ${numberAr(stage + 1)} من ٥`}
            </span>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-teal-200">
              {complete ? <CheckCircle size={23} /> : <StepIcon size={23} />}
            </span>
          </div>

          <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-black leading-relaxed tracking-tight text-white outline-none">
            {complete ? "خطة تجمعكم، وسالفة تكمل" : step?.title || scenario.title}
          </h2>

          {stage === -1 ? (
            <>
              <p className="mt-3 text-[15px] leading-8 text-white/80">{scenario.setting}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {scenario.choices.map((choice, index) => (
                  <div key={choice} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-300/10 text-[11px] font-black text-teal-200">{numberAr(index + 1)}</span>
                    <span className="text-sm font-semibold text-white/80">{choice}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-6 text-white/50">هذه أفكار للبداية؛ اختاروا اللي يشبهكم أو اقترحوا غيرها.</p>
              <div className="mt-4 flex gap-2.5 rounded-2xl border border-teal-300/15 bg-teal-300/[0.06] p-3.5">
                <Users size={18} className="mt-1 shrink-0 text-teal-200" />
                <p className="text-sm leading-7 text-teal-50/85">هاتف واحد في المنتصف. اسمعوا من الجميع، وابنوا على أفكار بعض. بعدين… فيه تغيير مفاجئ!</p>
              </div>
            </>
          ) : complete ? (
            <>
              <p className="mt-3 text-[15px] leading-8 text-white/75">يمكن أجمل شيء في الخطة كان اقتراح ما فكّرت فيه. خذوا هالفضول معكم وكمّلوا السالفة.</p>
              <div className="mt-5 rounded-2xl border border-teal-300/20 bg-teal-300/[0.07] p-4">
                <p className="text-xs font-bold text-teal-200">إذا ودّكم تكملون</p>
                <p className="mt-2 text-lg font-bold leading-8 text-white">وش شيء ثاني ودّكم تجرّبونه مع ناس جدد؟</p>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs leading-6 text-teal-100/60">{scenario.title}</p>
              {stage === 1 && names.length > 0 && (
                <div className="mt-3 rounded-2xl border border-teal-300/20 bg-teal-300/[0.08] p-3">
                  <p className="text-[11px] font-bold text-teal-200">الدور الآن · {numberAr(speaker + 1)} من {numberAr(names.length)}</p>
                  <p className="mt-1 break-words text-xl font-black text-white">{speakerName}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
                    {names.map((_, index) => <span key={index} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${index < speaker ? "bg-teal-300/20 text-teal-200" : index === speaker ? "bg-teal-300 text-gray-950" : "bg-white/5 text-white/40"}`}>{index < speaker ? <Check size={12} /> : numberAr(index + 1)}</span>)}
                  </div>
                </div>
              )}
              <p className={`mt-4 text-lg font-bold leading-8 ${stage === 3 ? "text-amber-100" : "text-white"}`}>{prompt}</p>
              <p className="mt-2 text-sm leading-6 text-white/60">{step.cue}</p>
              {stage === 1 && names.length === 0 && <p className="mt-2 text-xs leading-6 text-teal-200">ابدؤوا بالشخص على يمين الهاتف ومرّروا الدور؛ حوالي ٢٠ ثانية لكل شخص.</p>}
              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold text-white/45">{stage === 1 && names.length > 0 ? "مساحة لكل صوت" : "خذوا وقتكم"}</p>
                    <span role="timer" aria-label="الوقت المتبقي" dir="ltr" className={`mt-1 block font-mono text-3xl font-semibold tabular-nums ${seconds === 0 ? "text-amber-200" : "text-teal-100"}`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
                  </div>
                  <button type="button" onClick={toggleTimer} disabled={seconds === 0} aria-label={running ? "إيقاف المؤقت مؤقتاً" : "استئناف المؤقت"} className="event3-soft-action flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/80 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-teal-200">
                    {running ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                </div>
                <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-teal-300 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${duration ? (seconds / duration) * 100 : 0}%` }} /></div>
                <p role="status" className="mt-2 text-[11px] leading-5 text-white/50">{seconds === 0 ? "خلص الوقت المقترح. كمّلوا براحتكم أو انتقلوا." : "المؤقت يساعدكم فقط؛ انتقلوا لما تكونون جاهزين."}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 mt-4 space-y-1 rounded-2xl border border-white/[0.06] bg-gray-950/95 p-2 shadow-[0_-12px_30px_-12px_rgba(3,7,18,.8)] backdrop-blur-xl">
        {complete ? (
          <>
            <button type="button" onClick={onFinish} className={primaryButton}>العودة للأنشطة <ArrowLeft size={17} /></button>
            <button type="button" onClick={() => { setScenarioIndex(index => (index + 1) % SCENARIOS.length); enterStage(-1); }} className="event3-tertiary-action flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white/60"><RefreshCw size={15} /> نجرّب موقف ثاني</button>
          </>
        ) : (
          <>
            <button type="button" onClick={advance} className={primaryButton}>
              {stage === -1 ? "يلا، نفكّر مع بعض" : stage === 0 ? "جاهزين — نسمع من الجميع" : stage === 1 ? (speaker < names.length - 1 ? "سمعنا منك — اللي بعدك" : "سمعنا من الجميع — نبني الخطة") : stage === 2 ? "اتفقنا — وش المفاجأة؟" : stage === 3 ? "عدّلنا الخطة — وش اكتشفنا؟" : "نختم التحدّي"}
              <ArrowLeft size={17} className="shrink-0" />
            </button>
            {stage === -1 && <button type="button" onClick={() => setScenarioIndex(index => (index + 1) % SCENARIOS.length)} className="event3-tertiary-action flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white/60"><Shuffle size={15} /> موقف ثاني</button>}
            {stage === 1 && names.length > 0 && <button type="button" onClick={advance} className="event3-tertiary-action min-h-12 w-full rounded-xl text-sm font-semibold text-white/55">أمرّر دوري، عادي</button>}
          </>
        )}
      </div>
      <p className="mt-3 text-center text-[11px] leading-6 text-white/40">المشاركة على راحتكم · ما فيه فائز، فيه فرصة نعرف بعض</p>
    </section>
  );
}
