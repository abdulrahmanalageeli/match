import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { X, Magnet, Clock, Gamepad2, Sparkles, ChevronRight, Play, Target } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { animate } from "motion";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupMembers: string[];
  tableNumber: number | null;
  participantNumbers?: number[];           // Prefer numbers instead of names for display
  participantGenders?: ("male" | "female" | null)[]; // Aligned with participantNumbers
  selfParticipantNumber?: number | null;   // Highlight this participant
  games?: { id: string; nameAr: string; color: string; icon?: JSX.Element }[]; // Optional games to show
}

export function OnboardingModal({ isOpen, onClose, groupMembers, tableNumber, participantNumbers, participantGenders, selfParticipantNumber, games }: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const progress = ((currentSlide + 1) / 4) * 100;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const slideAreaRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const iconRef = useRef<HTMLDivElement | null>(null);
  const wipeRef = useRef<HTMLDivElement | null>(null);
  const [wipe, setWipe] = useState(false);
  // Compact modes for short screens to avoid header/content being cut
  const [compact, setCompact] = useState(false);
  const [superCompact, setSuperCompact] = useState(false);
  const [ultraCompact, setUltraCompact] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const h = window.innerHeight;
        setCompact(h < 700);
        setSuperCompact(h < 600);
        setUltraCompact(h < 560);
      } catch {}
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Welcome name for personalization
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  useEffect(() => {
    try {
      const name = localStorage.getItem('blindmatch_participant_name');
      if (name && name.trim()) setWelcomeName(name);
    } catch {}
  }, []);

  // Derive self participant number if not provided via props
  const derivedSelfNumber = useMemo(() => {
    if (selfParticipantNumber != null) return selfParticipantNumber;
    try {
      const raw = sessionStorage.getItem('groups_semi_login');
      if (raw) {
        const j = JSON.parse(raw);
        if (Number.isFinite(j?.assigned_number)) return j.assigned_number as number;
      }
    } catch {}
    return null;
  }, [selfParticipantNumber]);

  // Determine numbers list (for seat mapping) from props or heuristics
  const numbersToShow = useMemo(() => {
    let base: number[] = [];
    if (participantNumbers && participantNumbers.length) {
      base = [...participantNumbers];
    } else if (groupMembers && groupMembers.length) {
      const parsed: number[] = [];
      for (const gm of groupMembers) {
        if (typeof gm === 'string') {
          const m = gm.match(/#(\d{1,4})/);
          if (m && m[1]) {
            const n = parseInt(m[1], 10);
            if (Number.isFinite(n)) parsed.push(n);
          }
        }
      }
      base = parsed.length ? parsed : groupMembers.map((_, i) => i + 1);
    }
    if (derivedSelfNumber != null && !base.includes(derivedSelfNumber)) base.unshift(derivedSelfNumber);
    return base; // full list (3–6)
  }, [participantNumbers, groupMembers, derivedSelfNumber]);

  // Desired seat count: prefer participantNumbers length, else groupMembers length, clamped to [3,6]
  const desiredSeatCount = useMemo(() => {
    const numbersLen = Array.isArray(participantNumbers) ? participantNumbers.length : 0;
    const membersLen = Array.isArray(groupMembers) ? groupMembers.length : 0;
    const len = numbersLen >= 3 ? numbersLen : membersLen;
    return Math.max(3, Math.min(6, len || 3));
  }, [participantNumbers, groupMembers.length]);

  // Derive aligned genders for seats (fallback nulls)
  const seatGenders = useMemo(() => {
    const count = desiredSeatCount;
    const arr: ("male" | "female" | null)[] = new Array(count).fill(null);
    // Prefer robust alignment using participantNumbers -> participantGenders mapping
    if (participantNumbers && participantNumbers.length && participantGenders && participantGenders.length) {
      const map = new Map<number, "male" | "female" | null>();
      for (let i = 0; i < participantNumbers.length; i++) {
        const num = participantNumbers[i];
        const g = participantGenders[i];
        map.set(num, g === 'male' || g === 'female' ? g : null);
      }
      for (let i = 0; i < count; i++) {
        const n = numbersToShow[i];
        if (Number.isFinite(n)) arr[i] = map.get(n) ?? null;
      }
    } else if (participantGenders && participantGenders.length) {
      // Fallback: align by index if numbers not provided
      for (let i = 0; i < Math.min(count, participantGenders.length); i++) {
        const g = participantGenders[i];
        arr[i] = g === 'male' || g === 'female' ? g : null;
      }
    }
    return arr;
  }, [participantNumbers, participantGenders, numbersToShow, desiredSeatCount]);

  // Gender summary for display (total/male/female/unknown)
  const genderSummary = useMemo(() => {
    const total = desiredSeatCount;
    const male = seatGenders.filter(g => g === 'male').length;
    const female = seatGenders.filter(g => g === 'female').length;
    const unknown = Math.max(0, total - male - female);
    return { total, male, female, unknown };
  }, [seatGenders, desiredSeatCount]);

  // Seating positions around a circle
  const seatPositions = useMemo(() => {
    const count = desiredSeatCount;
    const positions: { top: string; left: string }[] = [];
    const radius = 38; // percent-based radius inside container
    const center = { x: 50, y: 50 };
    // Start from top (-90deg) and distribute clockwise
    for (let i = 0; i < count; i++) {
      const angle = (-90 + (360 / count) * i) * (Math.PI / 180);
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      positions.push({ top: `${y}%`, left: `${x}%` });
    }
    return positions;
  }, [desiredSeatCount]);

  const seatCount = useMemo(() => desiredSeatCount, [desiredSeatCount]);
  const selfIndex = useMemo(() => {
    if (derivedSelfNumber == null) return 0;
    const idx = numbersToShow.findIndex(n => n === derivedSelfNumber);
    return idx >= 0 ? idx : 0;
  }, [numbersToShow, derivedSelfNumber]);

  if (!isOpen) return null;

  const slides = [
    {
      icon: <Magnet className="w-12 h-12" />,
      title: "كشف التوافق",
      description: "لقد انضممت إلى مجموعتك — استعد لتجربة جماعية ممتعة!",
      color: "from-indigo-500 to-violet-600",
      details: [
        "تعرف على أعضاء مجموعتك",
        "انسجام رغم الاختلاف",
        "استمتع وكن على طبيعتك"
      ]
    },
    {
      icon: <Gamepad2 className="w-12 h-12" />,
      title: "بطاقات التعارف",
      description: "اختروا أدوات كسر الجليد المناسبة لكم",
      color: "from-teal-500 to-cyan-600",
      details: [
        "لم أفعل من قبل",
        "ماذا تفضل",
        "ولا كلمة",
        "قاعدة ٥ ثواني",
        "أسئلة للنقاش"
      ]
    },
    {
      icon: <Clock className="w-12 h-12" />,
      title: "الوقت المتاح",
      description: " لديك 45 دقيقة من المتعة والترابط",
      color: "from-rose-500 to-pink-600",
      details: ["جاهز؟ العداد ممتلئ للبداية!"]
    },
    {
      icon: <Sparkles className="w-12 h-12" />,
      title: "لحظة الإقلاع",
      description: groupMembers.length > 0 
        ? `أنت في المجموعة ${tableNumber ? `رقم ${tableNumber}` : ''} مع ${groupMembers.length} مشاركين`
        : "أنت جاهز للبدء",
      color: "from-orange-500 to-purple-600",
      details: groupMembers.length > 0 ? [
        "تأكد أن جميع أعضاء المجموعة حاضرون (٣-٦ مشاركين)",
        "يمكنكم التبديل بين الألعاب في أي وقت",
        "بعد الأنشطة الجماعية ستنتقل إلى جلسات فردية 1-ل-1 لمدة 30 دقيقة على الأقل",
        "استمتعوا ولا تنسوا التفاعل مع بعض!"
      ] : [
        "انتظر تنسيق المجموعة",
        "بعد الأنشطة الجماعية ستنتقل إلى جلسات فردية 1-ل-1 لمدة 30 دقيقة على الأقل",
        "أو ابدأ التصفح الآن"
      ]
    }
  ];

  const currentSlideData = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;

  const handleNext = async () => {
    if (isLastSlide) {
      try {
        const mod: any = await import("canvas-confetti");
        const confetti = mod?.default || mod;
        confetti({ particleCount: 80, spread: 60, startVelocity: 45, scalar: 0.9 });
      } catch {}
      // Play a stylish screen wipe then close
      setTimeout(() => setWipe(true), 120);
      setTimeout(() => {
        onClose();
      }, 820);
    } else {
      // Animate slide out, switch, then slide in
      if (slideAreaRef.current) {
        await animate(
          slideAreaRef.current!,
          { opacity: [1, 0], transform: ['translateX(0px)', 'translateX(-18px)'] } as any,
          { duration: 0.22, easing: 'ease-in' } as any
        ).finished;
      }
      const next = currentSlide + 1;
      setCurrentSlide(next);
      // Progress bar animation
      if (progressRef.current) {
        await animate(progressRef.current!, { width: `${((next + 1) / 4) * 100}%` } as any, { duration: 0.35, easing: 'ease-out' } as any).finished;
      }
      // Animate slide in
      if (slideAreaRef.current) {
        await animate(
          slideAreaRef.current!,
          { opacity: [0, 1], transform: ['translateX(18px)', 'translateX(0px)'] } as any,
          { duration: 0.28, easing: 'ease-out' } as any
        ).finished;
      }
    }
  };

  const handleSkip = () => {
    onClose();
  };

  // Entry animation when modal opens
  useEffect(() => {
    if (!isOpen) return;
    // Overlay fade
    if (overlayRef.current) {
      animate(overlayRef.current!, { opacity: [0, 1] } as any, { duration: 0.25, easing: 'ease-out' } as any);
    }
    // Card spring-in
    if (cardRef.current) {
      animate(
        cardRef.current!,
        { opacity: [0, 1], transform: ['translateY(16px) scale(0.98)', 'translateY(0px) scale(1)'] } as any,
        { duration: 0.32, easing: 'cubic-bezier(.22,.61,.36,1)' } as any
      );
    }
    // Slide initial fade-in
    if (slideAreaRef.current) {
      animate(
        slideAreaRef.current!,
        { opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0px)'] } as any,
        { duration: 0.32, easing: 'ease-out' } as any
      );
    }
  }, [isOpen]);

  // Icon micro-bounce on slide change
  useEffect(() => {
    if (iconRef.current) {
      animate(
        iconRef.current!,
        { transform: ['scale(0.92)', 'scale(1)'] } as any,
        { duration: 0.24, easing: 'cubic-bezier(.22,.61,.36,1)' } as any
      );
    }
  }, [currentSlide]);

  // Wipe exit animation
  useEffect(() => {
    if (wipe && wipeRef.current) {
      animate(wipeRef.current!, { transform: 'scale(120)' } as any, { duration: 0.7, easing: 'cubic-bezier(.22,.61,.36,1)' } as any);
    }
  }, [wipe]);

  return (
    <div ref={overlayRef} dir="rtl" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xl p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Cohesive background accents (like PhoneEntry) */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -top-28 -left-28 w-[560px] h-[560px] rounded-full bg-linear-to-br from-orange-400 via-pink-500 to-pink-600 blur-3xl opacity-60 animate-orb mix-blend-screen" />
        <div className="absolute -bottom-32 -right-24 w-[620px] h-[620px] rounded-full bg-linear-to-br from-blue-600 via-indigo-700 to-indigo-900 blur-3xl opacity-60 animate-orb-alt mix-blend-screen" />
        <div className="absolute inset-0 grain-overlay opacity-[0.05]" />
      </div>
      {/* Screen wipe overlay */}
      {wipe && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div ref={wipeRef} className="bg-linear-to-r from-indigo-600 to-violet-600 rounded-full w-12 h-12" style={{ transform: 'scale(0)' }} />
        </div>
      )}
      <div className="relative z-10 w-full max-w-md">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute -top-2 -right-2 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/15 hover:border-white/30 flex items-center justify-center text-slate-200 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Main card */}
        <div ref={cardRef} className="bg-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[82dvh] sm:max-h-[80vh] min-h-0">
          {/* Header with animated gradient */}
          <div className={`bg-linear-to-r ${currentSlideData.color} ${ultraCompact ? 'p-2' : superCompact ? 'p-3' : compact ? 'p-4' : 'py-12 px-6 sm:py-16 sm:px-8'} text-center relative overflow-hidden`}>
            <div className="absolute inset-0 bg-black/10"></div>
            {/* Top progress bar */}
            <div className={`absolute top-0 left-0 right-0 ${ultraCompact ? 'h-0.5' : 'h-1'} bg-white/20`}>
              <div ref={progressRef} className="h-full bg-white/80" style={{ width: `${progress}%` }} />
            </div>
            <div className={`relative z-10 mx-auto flex flex-row items-center justify-center ${ultraCompact ? 'gap-2' : 'gap-3'}`} dir="ltr">
              <div ref={iconRef} className={`${ultraCompact ? 'w-10 h-10 [&_svg]:w-6 [&_svg]:h-6' : superCompact ? 'w-12 h-12 [&_svg]:w-8 [&_svg]:h-8' : compact ? 'w-16 h-16 [&_svg]:w-10 [&_svg]:h-10' : 'w-20 h-20 [&_svg]:w-12 [&_svg]:h-12'} rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white ${compact || superCompact || ultraCompact ? '' : 'animate-heartbeat'} ${compact ? 'scale-95' : ''}`}>
                {currentSlideData.icon}
              </div>
              <h2 className={`${ultraCompact ? 'text-lg' : superCompact ? 'text-xl' : compact ? 'text-2xl' : 'text-3xl'} font-extrabold text-white leading-tight`}>
                {currentSlideData.title}
              </h2>
            </div>

            {/* Decorative elements */}
            <div className="absolute top-4 right-4 w-20 h-20 bg-white/5 rounded-full blur-2xl"></div>
            <div className="absolute bottom-4 left-4 w-16 h-16 bg-white/5 rounded-full blur-xl"></div>
          </div>

          {/* Content */}
          <div ref={slideAreaRef} className={`${ultraCompact ? 'p-2' : superCompact ? 'p-3' : compact ? 'p-4' : 'p-5 sm:p-8'} ${ultraCompact ? 'space-y-3' : compact ? 'space-y-4' : 'space-y-6'} flex-1 overflow-y-auto custom-scrollbar min-h-0`}> 
            {/* Opposites Attract banner (disabled for this event) */}
            {false && (
              <div className="flex items-center justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span className="text-amber-200 text-xs font-bold">Opposites Attract</span>
                </div>
              </div>
            )}
            {/* One-on-one explanation callout */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-400/20 text-blue-100 text-xs sm:text-sm justify-center">
              <Clock className="w-4 h-4" />
              <span>بعد الأنشطة الجماعية تبدأ جلسات 1-ل-1 لمدة 30 دقيقة على الأقل</span>
            </div>
            {/* Greeting on first slide */}
            {currentSlide === 0 && (
              <div className="text-center mb-1">
                <div className="text-white/90 text-xl font-extrabold animate-in fade-in duration-300">
                  {`مرحباً${welcomeName ? `، ${welcomeName}` : ''}!`}
                </div>
              </div>
            )}

            <p className={`text-slate-200 text-center ${superCompact ? 'text-sm' : compact ? 'text-base' : 'text-lg'} leading-relaxed animate-slide-in-up`}>
              {currentSlideData.description}
            </p>

            {/* Slide-specific content */}
            {currentSlide === 0 && (
              <div className="flex flex-col items-center justify-center gap-4">
                {/* Identity chips */}
                <div className="flex items-center gap-2">
                  {typeof tableNumber === 'number' && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-100 text-xs">
                      <Target className="w-3.5 h-3.5" />
                      طاولة {tableNumber}
                    </div>
                  )}
                  {derivedSelfNumber != null && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 text-xs">
                      <span>#{derivedSelfNumber}</span>
                    </div>
                  )}
                </div>

                {/* Gender breakdown chips */}
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-white/80 text-xs">
                    <span>عدد المشاركين</span>
                    <span className="font-bold">{genderSummary.total}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-100 text-xs">
                    <span>ذكور</span>
                    <span className="font-bold">{genderSummary.male}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-500/20 border border-pink-400/30 text-pink-100 text-xs">
                    <span>إناث</span>
                    <span className="font-bold">{genderSummary.female}</span>
                  </div>
                  {genderSummary.unknown > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/20 border border-slate-400/30 text-slate-100 text-xs">
                      <span>غير محدد</span>
                      <span className="font-bold">{genderSummary.unknown}</span>
                    </div>
                  )}
                </div>

                {/* Table & chairs visualization */}
                <div className={`relative w-full max-w-sm ${superCompact ? 'aspect-3/4' : compact ? 'aspect-5/6' : 'aspect-square'} mt-2`}>
                  {/* Table */}
                  <div className="absolute inset-[14%] rounded-full bg-linear-to-br from-slate-700/60 to-slate-800/60 border border-white/10 flex items-center justify-center text-white/90">
                    <div className="text-center">
                      <div className="text-xs text-white/70">طاولتك</div>
                      <div className="text-xl font-extrabold">{typeof tableNumber === 'number' ? tableNumber : '—'}</div>
                    </div>
                  </div>

                  {/* Seats */}
                  {Array.from({ length: seatCount }).map((_, idx) => {
                    const isSelf = idx === selfIndex;
                    const style = {
                      top: seatPositions[idx]?.top || '50%',
                      left: seatPositions[idx]?.left || '50%',
                      transform: 'translate(-50%, -50%)'
                    } as CSSProperties;
                    const g = seatGenders[idx];
                    const genderLabel = g === 'male' ? 'ذكر' : g === 'female' ? 'أنثى' : '—';
                    const baseCls = isSelf
                      ? 'bg-linear-to-br from-amber-400 to-pink-400 text-slate-900 border-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.45)]'
                      : (g === 'male'
                          ? 'bg-blue-500/25 text-blue-100 border-blue-300/40'
                          : g === 'female'
                            ? 'bg-pink-500/25 text-pink-100 border-pink-300/40'
                            : 'bg-white/15 text-white/80 border-white/25');
                    return (
                      <div key={idx} className="absolute" style={style}>
                        <div className={`${superCompact ? 'w-12 h-12' : compact ? 'w-14 h-14' : 'w-16 h-16'} rounded-full border backdrop-blur-sm flex items-center justify-center text-sm font-bold ${baseCls}`}>
                          {isSelf ? (
                            <div className="flex flex-col items-center leading-tight">
                              <div className="text-[10px] font-semibold opacity-80">أنت</div>
                              <div>#{derivedSelfNumber ?? '—'}</div>
                            </div>
                          ) : (
                            <span className="text-xs">{genderLabel}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Hint */}
                <div className="text-xs text-white/60 mt-1">لن نعرض أرقام بقية المشاركين — فقط نوع الجنس لكل مقعد</div>
              </div>
            )}

            {currentSlide === 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(games && games.length ? games : [
                  { id: 'discussion-questions', nameAr: 'أسئلة للنقاش', color: 'from-purple-500 to-pink-500' },
                  { id: 'what-would-you-do', nameAr: 'ماذا تفعل لو', color: 'from-indigo-500 to-blue-600' },
                  { id: '5-second-rule', nameAr: 'قاعدة الخمس ثواني', color: 'from-orange-500 to-red-500' },
                  { id: 'charades', nameAr: 'ولا كلمة', color: 'from-green-500 to-teal-500' },
                  { id: 'never-have-i-ever', nameAr: 'لم أفعل من قبل', color: 'from-blue-500 to-cyan-500' },
                  { id: 'would-you-rather', nameAr: 'ماذا تفضل', color: 'from-red-500 to-orange-500' }
                ]).map((g, i) => (
                  <div key={g.id || i} className="rounded-xl bg-white/10 border border-white/15 p-3 text-center text-white/90 text-sm shadow hover:shadow-lg transition-all">
                    <div className={`w-10 h-10 mx-auto mb-2 rounded-xl bg-linear-to-br ${g.color} flex items-center justify-center text-white`}> {g.icon ?? null} </div>
                    <div className="font-semibold">{g.nameAr}</div>
                  </div>
                ))}
              </div>
            )}

            {currentSlide === 2 && (
              <div className="flex flex-col items-center gap-4">
                {/* Circular progress full */}
                <svg width="120" height="120" viewBox="0 0 120 120" className="drop-shadow-[0_0_20px_rgba(244,63,94,0.35)]">
                  <defs>
                    <linearGradient id="gradPink" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f43f5e" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                  <circle cx="60" cy="60" r="50" stroke="#ffffff22" strokeWidth="10" fill="none" />
                  <circle cx="60" cy="60" r="50" stroke="url(#gradPink)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="314" strokeDashoffset="0" />
                </svg>
                <div className="text-4xl font-extrabold text-white">45 دقيقة</div>
                <div className="text-sm text-white/80">انطلقوا الآن — الوقت يبدأ عند البدء</div>
              </div>
            )}

            {/* Spacer to keep consistent height */}
            <div className="pt-2" />

            {/* Navigation buttons */}
            <div className="flex gap-3 pt-4">
              {!isLastSlide && (
                <Button
                  onClick={handleSkip}
                  variant="outline"
                  className="flex-1 bg-white/10 border-white/20 hover:bg-white/15 hover:border-white/30 text-white/90 hover:text-white transition-all duration-200"
                >
                  تخطي
                </Button>
              )}
              <Button
                onClick={handleNext}
                className={`flex-1 ${isLastSlide ? 'animate-pulse shadow-[0_0_32px_rgba(255,255,255,0.25)]' : ''} bg-linear-to-r ${currentSlideData.color} hover:opacity-90 text-white font-extrabold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
              >
                {isLastSlide ? (
                  <>
                    <Play className="w-5 h-5 ml-2" />
                    ابدأ الآن
                  </>
                ) : (
                  <>
                    التالي
                    <ChevronRight className="w-5 h-5 mr-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
