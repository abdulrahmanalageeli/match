import { useState } from "react";
import { X, Users, Clock, Trophy, Sparkles, ChevronRight, Play } from "lucide-react";
import { Button } from "../../../components/ui/button";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupMembers: string[];
  tableNumber: number | null;
}

export function OnboardingModal({ isOpen, onClose, groupMembers, tableNumber }: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!isOpen) return null;

  const slides = [
    {
      icon: <Users className="w-16 h-16" />,
      title: "مرحباً بك في الأنشطة الجماعية",
      description: "لقد تم وضعك في مجموعة مع مشاركين آخرين للاستمتاع بألعاب تفاعلية ممتعة",
      color: "from-cyan-500 to-blue-600",
      details: [
        "تعرف على أعضاء مجموعتك",
        "شارك قصصك وتجاربك",
        "استمتع بوقتك وكوّن صداقات جديدة"
      ]
    },
    {
      icon: <Clock className="w-16 h-16" />,
      title: "جلسة مدتها 30 دقيقة",
      description: "لديك نصف ساعة للعب والتواصل مع مجموعتك",
      color: "from-purple-500 to-pink-600",
      details: [
        "العد التنازلي يبدأ عند الضغط على \"ابدأ الجلسة\"",
        "يمكنك التبديل بين الألعاب في أي وقت",
        "سيتم إعلامك عند انتهاء الوقت"
      ]
    },
    {
      icon: <Trophy className="w-16 h-16" />,
      title: "5 ألعاب مختلفة",
      description: "اختر من بين مجموعة متنوعة من الألعاب التفاعلية",
      color: "from-emerald-500 to-teal-600",
      details: [
        "لم أفعل من قبل - شارك تجاربك",
        "ماذا تفضل - اختيارات صعبة",
        "ولا كلمة - التمثيل الصامت",
        "قاعدة الخمس ثواني - سرعة البديهة",
        "أسئلة للنقاش - محادثات عميقة"
      ]
    },
    {
      icon: <Sparkles className="w-16 h-16" />,
      title: "استعد للبدء!",
      description: groupMembers.length > 0 
        ? `أنت في المجموعة ${tableNumber ? `رقم ${tableNumber}` : ''} مع ${groupMembers.length} مشاركين`
        : "أنت جاهز للبدء",
      color: "from-amber-500 to-orange-600",
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

  const handleNext = () => {
    if (isLastSlide) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300 p-4">
      <div className="relative w-full max-w-md animate-in zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute -top-2 -right-2 z-10 w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-600 hover:border-slate-400 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Main card */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden">
          {/* Header with animated gradient */}
          <div className={`bg-gradient-to-r ${currentSlideData.color} p-8 text-center relative overflow-hidden`}>
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10 flex flex-col items-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white animate-in zoom-in duration-500">
                {currentSlideData.icon}
              </div>
              <h2 className="text-2xl font-bold text-white leading-tight">
                {currentSlideData.title}
              </h2>
            </div>

            {/* Decorative elements */}
            <div className="absolute top-4 right-4 w-20 h-20 bg-white/5 rounded-full blur-2xl"></div>
            <div className="absolute bottom-4 left-4 w-16 h-16 bg-white/5 rounded-full blur-xl"></div>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            <p className="text-slate-300 text-center text-lg leading-relaxed">
              {currentSlideData.description}
            </p>

            {/* Details list */}
            <div className="space-y-3">
              {currentSlideData.details.map((detail, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 animate-in slide-in-from-right duration-300"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${currentSlideData.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>
                    {index + 1}
                  </div>
                  <p className="text-slate-200 text-sm leading-relaxed flex-1">
                    {detail}
                  </p>
                </div>
              ))}
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2 pt-4">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide
                      ? 'w-8 bg-gradient-to-r ' + currentSlideData.color
                      : 'w-2 bg-slate-600 hover:bg-slate-500'
                  }`}
                  aria-label={`الانتقال إلى الشريحة ${index + 1}`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-3 pt-4">
              {!isLastSlide && (
                <Button
                  onClick={handleSkip}
                  variant="outline"
                  className="flex-1 bg-slate-800/50 border-slate-600 hover:bg-slate-700/50 hover:border-slate-500 text-slate-300 hover:text-white transition-all duration-200"
                >
                  تخطي
                </Button>
              )}
              <Button
                onClick={handleNext}
                className={`flex-1 bg-gradient-to-r ${currentSlideData.color} hover:opacity-90 text-white font-bold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]`}
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
