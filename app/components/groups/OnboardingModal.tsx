import { useState } from "react";
import { X, Magnet, Clock, Gamepad2, Sparkles, ChevronRight, Play } from "lucide-react";
import { Button } from "../../../components/ui/button";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupMembers: string[];
  tableNumber: number | null;
}

export function OnboardingModal({ isOpen, onClose, groupMembers, tableNumber }: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const progress = ((currentSlide + 1) / 4) * 100;

  if (!isOpen) return null;

  const slides = [
    {
      icon: <Magnet className="w-16 h-16" />,
      title: "كشف التوافق",
      description: "لقد انضممت إلى مجموعتك — استعد لتجربة " + "Opposites Attract" + "!",
      color: "from-indigo-500 to-violet-600",
      details: [
        "تعرف على أعضاء مجموعتك",
        "انسجام رغم الاختلاف",
        "استمتع وكن على طبيعتك"
      ]
    },
    {
      icon: <Gamepad2 className="w-16 h-16" />,
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
      icon: <Clock className="w-16 h-16" />,
      title: "الوقت المتاح",
      description: " لديك 30 دقيقة من المتعة والترابط",
      color: "from-rose-500 to-pink-600",
      details: ["جاهز؟ العداد ممتلئ للبداية!"]
    },
    {
      icon: <Sparkles className="w-16 h-16" />,
      title: "لحظة الإقلاع",
      description: groupMembers.length > 0 
        ? `أنت في المجموعة ${tableNumber ? `رقم ${tableNumber}` : ''} مع ${groupMembers.length} مشاركين`
        : "أنت جاهز للبدء",
      color: "from-orange-500 to-purple-600",
      details: groupMembers.length > 0 ? [
        "تأكد أن جميع أعضاء المجموعة حاضرون",
        "اختاروا لعبة معاً للبدء",
        "استمتعوا ولا تنسوا التفاعل مع بعض!"
      ] : [
        "انتظر تنسيق المجموعة",
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
      localStorage.setItem('groups_onboarding_seen', 'true');
      onClose();
    } else {
      setCurrentSlide(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('groups_onboarding_seen', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xl animate-in fade-in duration-300 p-4">
      <div className="relative w-full max-w-md animate-in zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute -top-2 -right-2 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/15 hover:border-white/30 flex items-center justify-center text-slate-200 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Main card */}
        <div className="bg-black/40 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
          {/* Header with animated gradient */}
          <div className={`bg-gradient-to-r ${currentSlideData.color} p-8 text-center relative overflow-hidden`}>
            <div className="absolute inset-0 bg-black/10"></div>
            {/* Top progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
              <div className="h-full bg-white/80" style={{ width: `${progress}%` }} />
            </div>
            <div className="relative z-10 flex flex-col items-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white animate-in zoom-in duration-500">
                {currentSlideData.icon}
              </div>
              <h2 className="text-3xl font-extrabold text-white leading-tight">
                {currentSlideData.title}
              </h2>
            </div>

            {/* Decorative elements */}
            <div className="absolute top-4 right-4 w-20 h-20 bg-white/5 rounded-full blur-2xl"></div>
            <div className="absolute bottom-4 left-4 w-16 h-16 bg-white/5 rounded-full blur-xl"></div>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            <p className="text-slate-200 text-center text-lg leading-relaxed animate-slide-in-up">
              {currentSlideData.description}
            </p>

            {/* Slide-specific content */}
            {currentSlide === 0 && (
              <div className="flex items-center justify-center gap-4">
                {(groupMembers.length ? groupMembers.slice(0,3) : ["?","?","?"]).map((name, i) => (
                  <div key={i} className="w-12 h-12 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white/90 text-sm font-bold">
                    {typeof name === 'string' && name.trim() ? name.trim().slice(0,2) : "?"}
                  </div>
                ))}
              </div>
            )}

            {currentSlide === 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                {slides[1].details.map((label, i) => (
                  <div key={i} className="rounded-xl bg-white/10 border border-white/15 p-3 text-center text-white/90 text-sm shadow hover:shadow-lg transition-all">
                    {label}
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
                <div className="text-4xl font-extrabold text-white">30 دقيقة</div>
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
                className={`flex-1 ${isLastSlide ? 'animate-pulse shadow-[0_0_32px_rgba(255,255,255,0.25)]' : ''} bg-gradient-to-r ${currentSlideData.color} hover:opacity-90 text-white font-extrabold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
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
