import React, { useState } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, MessageSquare, ArrowLeftCircle, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";

// Topics data: from shallow to deep
const promptTopics = [
  {
    id: "icebreakers",
    title: "أسئلة تعارف سريعة",
    depth: "shallow",
    icon: <Sparkles className="w-5 h-5 text-cyan-400" />,
    questions: [
      "ما أكثر شيء استمتعت به مؤخراً؟",
      "لو كان بإمكانك السفر لأي مكان، أين ستذهب ولماذا؟",
      "ما هي هوايتك المفضلة؟",
      "ما هو أفضل كتاب أو فيلم شاهدته مؤخراً؟",
      "لو كان بإمكانك تعلم مهارة جديدة، ماذا ستكون؟",
      "ما هو أكثر شيء يجعلك تضحك؟",
      "ما هو حلمك الكبير في الحياة؟",
      "ما هو أكثر شيء تفتخر به في نفسك؟",
    ],
  },
  {
    id: "interests",
    title: "الهوايات والاهتمامات",
    depth: "shallow",
    icon: <MessageSquare className="w-5 h-5 text-blue-400" />,
    questions: [
      "ما هي هواياتك المفضلة ولماذا؟",
      "هل هناك نشاط جديد ترغب في تجربته؟",
      "ما هو أكثر شيء يحمسك في وقت فراغك؟",
      "هل تفضل الأنشطة الجماعية أم الفردية؟",
      "ما هو أكثر مكان تحب زيارته في مدينتك؟",
    ],
  },
  {
    id: "values",
    title: "القيم والمبادئ",
    depth: "medium",
    icon: <Sparkles className="w-5 h-5 text-green-400" />,
    questions: [
      "ما هي القيم التي تعتبرها أساسية في حياتك؟",
      "هل هناك مبدأ لا تتنازل عنه أبداً؟",
      "كيف تتعامل مع الاختلاف في وجهات النظر؟",
      "ما هو أهم درس تعلمته في حياتك؟",
    ],
  },
  {
    id: "relationships",
    title: "العلاقات والتواصل",
    depth: "medium",
    icon: <MessageSquare className="w-5 h-5 text-pink-400" />,
    questions: [
      "ما الذي تبحث عنه في صديق أو شريك؟",
      "كيف تعبر عن مشاعرك عادةً؟",
      "ما هو أفضل نصيحة تلقيتها عن العلاقات؟",
      "هل تفضل الصراحة أم المجاملة في التواصل؟",
    ],
  },
  {
    id: "dreams",
    title: "الأحلام والطموحات",
    depth: "deep",
    icon: <Sparkles className="w-5 h-5 text-purple-400" />,
    questions: [
      "ما هو أكبر حلم تسعى لتحقيقه؟",
      "ما هي العقبة الأكبر التي واجهتها في طريقك؟",
      "كيف تتخيل حياتك بعد خمس سنوات؟",
      "ما الذي يلهمك للاستمرار في السعي؟",
    ],
  },
  {
    id: "philosophy",
    title: "أسئلة عميقة وفلسفية",
    depth: "deep",
    icon: <MessageSquare className="w-5 h-5 text-yellow-400" />,
    questions: [
      "ما هو معنى السعادة بالنسبة لك؟",
      "هل تؤمن أن كل شيء يحدث لسبب؟",
      "ما هو تعريفك للنجاح؟",
      "كيف تتعامل مع التغيير في حياتك؟",
    ],
  },
];

const depthLabels = {
  shallow: "سطحية/خفيفة",
  medium: "متوسطة العمق",
  deep: "عميقة/فلسفية",
} as const;

const depthColors = {
  shallow: "from-cyan-400 to-blue-400",
  medium: "from-green-400 to-emerald-400",
  deep: "from-purple-400 to-pink-400",
} as const;

const depthOrder: Array<keyof typeof depthLabels> = ["shallow", "medium", "deep"];

export default function PromptTopicsModal({ open, onClose, dark }: { open: boolean; onClose: () => void; dark: boolean }) {
  const [selectedTopic, setSelectedTopic] = useState<null | typeof promptTopics[0]>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Accessibility: focus trap for modal
  // (Dialog from shadcn/ui already handles focus trap)

  // Floating particles for AI feel
  const floatingParticles = Array.from({ length: 7 });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className={`max-w-lg w-full rounded-2xl p-0 overflow-hidden border-0 relative ${dark ? "bg-slate-900 text-white" : "bg-white text-gray-900"}`}
        dir="rtl"
        aria-label="أسئلة للنقاش"
      >
        {/* Soft gradient background */}
        <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
          <div className={`absolute inset-0 bg-gradient-to-br ${dark ? "from-cyan-900/40 via-blue-900/30 to-purple-900/30" : "from-cyan-100/60 via-blue-100/40 to-purple-100/40"} rounded-2xl`} />
          {/* Floating particles */}
          {floatingParticles.map((_, i) => (
            <div
              key={i}
              className={`absolute rounded-full blur-xl opacity-20 animate-float-particle${i % 2 === 0 ? '' : '-reverse'} ${
                dark ? (i % 3 === 0 ? 'bg-cyan-400' : 'bg-blue-400') : (i % 3 === 0 ? 'bg-cyan-200' : 'bg-blue-200')
              }`}
              style={{
                width: `${18 + (i % 3) * 10}px`,
                height: `${18 + (i % 4) * 8}px`,
                top: `${10 + (i * 13) % 70}%`,
                left: `${5 + (i * 17) % 85}%`,
                animationDelay: `${i * 0.5}s`,
                zIndex: 0,
              }}
            />
          ))}
        </div>
        <DialogHeader className="flex flex-row items-center justify-between px-6 pt-6 pb-2 border-b border-slate-700/20 z-10 relative">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-400 animate-pulse" />
            أسئلة للنقاش
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full" aria-label="إغلاق الأسئلة">
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>
        {/* Depth Progress Bar / Stepper */}
        <div className="flex items-center justify-between gap-2 px-6 pt-3 pb-2 z-10 relative">
          {depthOrder.map((depth, idx) => (
            <div key={depth} className="flex-1 flex flex-col items-center">
              <div
                className={`w-7 h-7 flex items-center justify-center rounded-full border-2 shadow transition-all duration-300 ${
                  selectedTopic && selectedTopic.depth === depth
                    ? `bg-gradient-to-br ${depthColors[depth]} border-cyan-400 scale-110` :
                  !selectedTopic && idx === 0
                    ? `bg-gradient-to-br ${depthColors[depth]} border-cyan-400 scale-110` :
                    dark
                      ? "bg-slate-800 border-slate-700"
                      : "bg-gray-200 border-gray-300"
                }`}
                aria-label={depthLabels[depth]}
              >
                {depth === "shallow" && <Sparkles className="w-4 h-4 text-cyan-400" />}
                {depth === "medium" && <Sparkles className="w-4 h-4 text-green-400" />}
                {depth === "deep" && <Sparkles className="w-4 h-4 text-purple-400" />}
              </div>
              <span className={`mt-1 text-xs font-medium ${selectedTopic && selectedTopic.depth === depth ? "text-cyan-400" : dark ? "text-slate-400" : "text-gray-500"}`}>{depthLabels[depth]}</span>
            </div>
          ))}
        </div>
        <div className="p-6 pt-2 min-h-[350px] max-h-[70vh] overflow-y-auto z-10 relative" tabIndex={0}>
          {!selectedTopic ? (
            <>
              <div className="mb-6 text-center">
                <p className="text-base font-medium opacity-80">اختر موضوعاً لبدء النقاش. المواضيع مرتبة من الأسهل إلى الأعمق.</p>
              </div>
              <div className="space-y-6">
                {depthOrder.map(depth => (
                  <div key={depth}>
                    <div className={`mb-2 text-sm font-bold ${depth === "shallow" ? "text-cyan-400" : depth === "medium" ? "text-green-400" : "text-purple-400"}`}>{depthLabels[depth]}</div>
                    <div className="flex flex-wrap gap-3">
                      {promptTopics.filter(t => t.depth === depth).map(topic => (
                        <button
                          key={topic.id}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg transition-all duration-200 border-2 font-semibold text-base hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 active:scale-95 active:shadow-inner ${
                            depth === "shallow"
                              ? "bg-cyan-50/80 border-cyan-200 text-cyan-800 hover:bg-cyan-100"
                              : depth === "medium"
                              ? "bg-green-50/80 border-green-200 text-green-800 hover:bg-green-100"
                              : "bg-purple-50/80 border-purple-200 text-purple-800 hover:bg-purple-100"
                          }`}
                          onClick={() => setSelectedTopic(topic)}
                          aria-label={`اختر موضوع: ${topic.title}`}
                        >
                          {topic.icon}
                          {topic.title}
                          <ChevronLeft className="w-4 h-4 opacity-60" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Button variant="ghost" size="icon" onClick={() => setSelectedTopic(null)} className="rounded-full" aria-label="رجوع للمواضيع">
                  <ArrowLeftCircle className="w-6 h-6 text-cyan-400" />
                </Button>
                <span className="text-lg font-bold flex items-center gap-2">{selectedTopic.icon} {selectedTopic.title}</span>
              </div>
              {selectedTopic.questions.length === 0 ? (
                <div className="text-center py-12 text-lg font-semibold text-cyan-400">لا توجد أسئلة لهذا الموضوع بعد.</div>
              ) : (
                <div className="space-y-4">
                  {selectedTopic.questions.map((q, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 p-4 rounded-xl border-2 shadow-sm transition-all duration-200 group ${
                        selectedTopic.depth === "shallow"
                          ? "bg-cyan-50/80 border-cyan-200 text-cyan-900"
                          : selectedTopic.depth === "medium"
                          ? "bg-green-50/80 border-green-200 text-green-900"
                          : "bg-purple-50/80 border-purple-200 text-purple-900"
                      }`}
                      tabIndex={0}
                      aria-label={`سؤال ${i + 1}: ${q}`}
                    >
                      <span className="font-bold text-lg">{i + 1}.</span>
                      <span className="flex-1 text-base">{q}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full relative"
                        title="نسخ السؤال"
                        aria-label="نسخ السؤال"
                        onClick={() => {
                          navigator.clipboard.writeText(q);
                          setCopiedIndex(i);
                          setTimeout(() => setCopiedIndex(null), 1200);
                        }}
                      >
                        {copiedIndex === i ? (
                          <span className="absolute -top-8 right-0 bg-green-500 text-white text-xs rounded px-2 py-1 shadow animate-fade-in z-20 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> تم النسخ!</span>
                        ) : null}
                        <ChevronRight className="w-5 h-5 text-cyan-400 group-hover:scale-125 transition-transform" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 