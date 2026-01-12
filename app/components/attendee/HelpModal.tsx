import React from "react";
import { X, Info, Users, Clock, Sparkles, HeartHandshake, CheckCircle } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { AttendeeStage } from "./SlideShell";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStage: AttendeeStage;
}

export function HelpModal({ isOpen, onClose, currentStage }: HelpModalProps) {
  if (!isOpen) return null;

  const stageLabel: Record<AttendeeStage, string> = {
    intro: "الترحيب",
    groups: "الأنشطة الجماعية",
    rounds: "جولة المطابقة",
    finished: "النتائج"
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md animate-in zoom-in-95 duration-200">
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="إغلاق"
          className="absolute -top-2 -right-2 z-10 w-10 h-10 rounded-full bg-slate-800 border-2 border-slate-600 hover:border-slate-400 flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Card */}
        <div className="rounded-3xl overflow-hidden border border-slate-700/50 bg-slate-900/95 shadow-2xl">
          {/* Header */}
          <div className="bg-linear-to-r from-cyan-600 to-blue-700 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
                <Info className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-extrabold leading-tight">دليل التجربة</h2>
                <p className="text-white/90 text-sm">أنت الآن في: <span className="font-bold">{stageLabel[currentStage]}</span></p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Stages overview */}
            <div>
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                مراحل رحلتك
              </h3>
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <p className="text-white font-semibold flex items-center gap-2 mb-1">
                    <HeartHandshake className="w-4 h-4 text-emerald-400" />
                    الترحيب
                  </p>
                  <p className="text-slate-300 text-sm">تأكيد الدخول باستخدام الرمز الخاص بك، ومعرفة الخطوات القادمة بإيجاز.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <p className="text-white font-semibold flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-cyan-400" />
                    الأنشطة الجماعية
                  </p>
                  <p className="text-slate-300 text-sm">التعرف على مجموعتك واللعب معاً لمدة 30 دقيقة. سترى رقم المجموعة، الطاولة، وأسماء الأعضاء.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <p className="text-white font-semibold flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-amber-400" />
                    جولة المطابقة
                  </p>
                  <p className="text-slate-300 text-sm">أسئلة مخصصة لكل جولة مع مؤقّت واضح. بعد الجولة تعبّي تقييمك بسرعة.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <p className="text-white font-semibold flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    النتائج
                  </p>
                  <p className="text-slate-300 text-sm">بعد نهاية الحدث، يمكنك عرض النتائج ومعرفة من كان التوافق متبادلاً.</p>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div>
              <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400" />
                نصائح سريعة
              </h3>
              <ul className="text-slate-300 text-sm list-disc pr-5 space-y-1">
                <li>احفظ الرمز (Token) — نفس الرمز يفتح المجموعات والنتائج.</li>
                <li>إذا انتقلت الجولة تلقائياً، ستنتقل معك الصفحة إلى وضع الجولة.</li>
                <li>إن لم يظهر رقم مجموعتك فوراً، اضغط "عرض مجموعتي" لتحديثها.</li>
              </ul>
            </div>

            <div className="flex justify-end">
              <Button onClick={onClose} className="bg-linear-to-r from-cyan-500 to-blue-600 text-white">تم الفهم</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
