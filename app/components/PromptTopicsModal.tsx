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

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className={`max-w-xl w-full rounded-xl p-0 overflow-hidden border border-slate-200 dark:border-slate-700 fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${dark ? "bg-slate-900 text-white" : "bg-white text-gray-900"}`}
        dir="rtl"
        aria-label="أسئلة للنقاش"
      >
        <DialogHeader className="flex flex-row items-center justify-between px-6 pt-5 pb-2 border-b border-slate-200 dark:border-slate-700 z-10 relative bg-inherit sticky top-0">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-500" />
            أسئلة للنقاش
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full" aria-label="إغلاق الأسئلة">
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>
        {/* Depth Stepper - subtle accent only */}
        <div className="flex items-center justify-between gap-2 px-6 pt-3 pb-2 z-10 relative">
          {depthOrder.map((depth, idx) => (
            <div key={depth} className="flex-1 flex flex-col items-center">
              <div
                className={`w-7 h-7 flex items-center justify-center rounded-full border transition-all duration-300 ${
                  selectedTopic && selectedTopic.depth === depth
                    ? `bg-cyan-50 dark:bg-slate-800 border-cyan-400 scale-110` :
                  !selectedTopic && idx === 0
                    ? `bg-cyan-50 dark:bg-slate-800 border-cyan-400 scale-110` :
                    dark
                      ? "bg-slate-800 border-slate-700"
                      : "bg-gray-100 border-gray-300"
                }`}
                aria-label={depthLabels[depth]}
              >
                <Sparkles className={`w-4 h-4 ${depth === "shallow" ? "text-cyan-400" : depth === "medium" ? "text-green-400" : "text-purple-400"}`} />
              </div>
              <span className={`mt-1 text-xs font-medium ${selectedTopic && selectedTopic.depth === depth ? "text-cyan-500" : dark ? "text-slate-400" : "text-gray-500"}`}>{depthLabels[depth]}</span>
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
                    <div className={`mb-2 text-sm font-bold ${depth === "shallow" ? "text-cyan-500" : depth === "medium" ? "text-green-500" : "text-purple-500"}`}>{depthLabels[depth]}</div>
                    <div className="flex flex-wrap gap-3">
                      {promptTopics.filter(t => t.depth === depth).map(topic => (
                        <button
                          key={topic.id}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold text-base transition-all duration-200 hover:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 ${
                            depth === "shallow"
                              ? "bg-white dark:bg-slate-900 border-cyan-100 dark:border-slate-700 text-cyan-800 dark:text-cyan-300"
                              : depth === "medium"
                              ? "bg-white dark:bg-slate-900 border-green-100 dark:border-slate-700 text-green-800 dark:text-green-300"
                              : "bg-white dark:bg-slate-900 border-purple-100 dark:border-slate-700 text-purple-800 dark:text-purple-300"
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
              {/* Sticky topic header for long lists */}
              <div className="flex items-center gap-2 mb-4 sticky top-0 bg-inherit z-20 pb-2">
                <Button variant="ghost" size="icon" onClick={() => setSelectedTopic(null)} className="rounded-full" aria-label="رجوع للمواضيع">
                  <ArrowLeftCircle className="w-6 h-6 text-cyan-500" />
                </Button>
                <span className="text-lg font-bold flex items-center gap-2">{selectedTopic.icon} {selectedTopic.title}</span>
              </div>
              {selectedTopic.questions.length === 0 ? (
                <div className="text-center py-12 text-lg font-semibold text-cyan-500">لا توجد أسئلة لهذا الموضوع بعد.</div>
              ) : (
                <div className="space-y-2">
                  {selectedTopic.questions.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-3 rounded border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-200 group"
                      tabIndex={0}
                      aria-label={`سؤال ${i + 1}: ${q}`}
                    >
                      <span className="font-bold text-base text-slate-500 dark:text-slate-400 w-6 text-center">{i + 1}.</span>
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
                        <ChevronRight className="w-5 h-5 text-cyan-500 group-hover:scale-125 transition-transform" />
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