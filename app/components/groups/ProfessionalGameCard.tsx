import { useState } from "react";
import { ChevronLeft, Info, Clock, Users as UsersIcon } from "lucide-react";

interface GameCardProps {
  id: string;
  nameAr: string;
  descriptionAr: string;
  icon: React.ReactNode;
  color: string;
  duration: number;
  onSelect: (id: string) => void;
  recommended?: boolean;
}

export function ProfessionalGameCard({
  id,
  nameAr,
  descriptionAr,
  icon,
  color,
  duration,
  onSelect,
  recommended = false
}: GameCardProps) {
  const [showInfo, setShowInfo] = useState(false);

  const gameDetails: Record<string, { benefits: string[]; howToPlay: string[] }> = {
    "5-second-rule": {
      benefits: ["تحفيز سرعة البديهة", "جو مليء بالضحك", "مناسب للتعارف السريع"],
      howToPlay: ["يظهر موضوع عشوائي", "لديك 5 ثوان", "اذكر 3 أشياء متعلقة بالموضوع"]
    },
    "discussion-questions": {
      benefits: ["محادثات عميقة", "فهم أفضل للشخصيات", "بناء علاقات حقيقية"],
      howToPlay: ["اختاروا موضوعاً", "يجيب كل شخص بالدور", "استمعوا باهتمام"]
    },
    "charades": {
      benefits: ["نشاط حركي ممتع", "يكسر الجليد", "ضحك مضمون"],
      howToPlay: ["يظهر اسم فيلم/مشهور", "مثّل بدون كلام", "الفريق يخمن"]
    },
    "never-have-i-ever": {
      benefits: ["مشاركة تجارب شخصية", "اكتشاف قواسم مشتركة", "جو من الصراحة"],
      howToPlay: ["اقرؤوا العبارة", "من فعلها يرفع يده", "يشارك قصته"]
    },
    "would-you-rather": {
      benefits: ["تحفيز التفكير", "نقاشات فلسفية", "معرفة قيم الآخرين"],
      howToPlay: ["خيارات صعبة", "يختار كل شخص", "ناقشوا الأسباب"]
    }
  };

  const details = gameDetails[id] || { benefits: [], howToPlay: [] };

  return (
    <div className="relative group">
      {/* Recommended badge */}
      {recommended && (
        <div className="absolute -top-2 -right-2 z-10 animate-in zoom-in duration-500">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg border-2 border-white/20">
            ⭐ موصى به
          </div>
        </div>
      )}

      {/* Info button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowInfo(!showInfo);
        }}
        className="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-slate-700/80 backdrop-blur-sm border border-slate-600/50 hover:bg-slate-600/80 flex items-center justify-center text-slate-300 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95"
        aria-label="معلومات عن اللعبة"
      >
        <Info className="w-4 h-4" />
      </button>

      {/* Main card */}
      <div
        onClick={() => onSelect(id)}
        className="relative bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-xl rounded-2xl p-5 border border-slate-700/50 hover:border-slate-600 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-2xl transform hover:scale-[1.02] hover:-translate-y-1 active:scale-[0.98] overflow-hidden"
      >
        {/* Background gradient effect */}
        <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
        
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-2xl"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-gradient-to-tr from-white/5 to-transparent rounded-full blur-2xl"></div>

        <div className="relative z-10 flex items-start gap-4">
          {/* Icon */}
          <div className={`w-16 h-16 flex-shrink-0 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:rotate-3`}>
            {icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-cyan-400 group-hover:to-blue-400 transition-all duration-300">
              {nameAr}
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-3 line-clamp-2">
              {descriptionAr}
            </p>

            {/* Meta information */}
            <div className="flex items-center gap-4 text-slate-400 text-xs">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{duration} دقائق</span>
              </div>
              <div className="flex items-center gap-1.5">
                <UsersIcon className="w-3.5 h-3.5" />
                <span>3-6 أشخاص</span>
              </div>
            </div>

            {/* Play button hint */}
            <div className="mt-3 flex items-center gap-2 text-cyan-400 text-sm font-medium opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
              <span>ابدأ اللعبة</span>
              <ChevronLeft className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Info panel (slides down) */}
        {showInfo && (
          <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3 animate-in slide-in-from-top duration-300">
            {/* Benefits */}
            <div>
              <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"></span>
                فوائد اللعبة:
              </h4>
              <ul className="space-y-1">
                {details.benefits.map((benefit, index) => (
                  <li key={index} className="text-xs text-slate-300 flex items-center gap-2">
                    <span className="text-emerald-400">•</span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {/* How to play */}
            <div>
              <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"></span>
                طريقة اللعب:
              </h4>
              <ol className="space-y-1">
                {details.howToPlay.map((step, index) => (
                  <li key={index} className="text-xs text-slate-300 flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">{index + 1}.</span>
                    <span className="flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
