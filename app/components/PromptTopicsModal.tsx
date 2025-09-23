import React, { useState } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, MessageSquare, ArrowLeftCircle, CheckCircle, Star, Flame, HelpCircle, Heart, Gem, Users, Rocket, Brain } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from "../../components/ui/dialog";
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
      // Added questions
      "ما هو طعامك المفضل ولماذا؟",
      "هل تفضل الصباح أم المساء؟",
      "ما هي أغرب تجربة مررت بها؟",
      "ما هو المكان الذي تشعر فيه بالراحة دائماً؟",
      "ما هي أغنيتك المفضلة حالياً؟",
      "هل لديك عادة غريبة؟",
      "ما هو أكثر شيء تحب فعله في عطلة نهاية الأسبوع؟",
      "ما هو أكثر موقف محرج تعرضت له؟",
      "لو كان بإمكانك مقابلة أي شخصية مشهورة، من ستختار؟",
      "ما هو أكثر شيء تفتقده من طفولتك؟",
      "ما هو أفضل احتفال حضرته؟",
      "ما هو الشيء الذي لا يمكنك العيش بدونه؟",
      "ما هو أكثر شيء يثير فضولك؟",
      "ما هو أكثر قرار عفوي اتخذته؟"
    ],
  },
  {
    id: "interests",
    title: "الهوايات والاهتمامات",
    depth: "shallow",
    icon: <Heart className="w-5 h-5 text-cyan-400" />,
    questions: [
      "ما هي هواياتك المفضلة ولماذا؟",
      "هل هناك نشاط جديد ترغب في تجربته؟",
      "ما هو أكثر شيء يحمسك في وقت فراغك؟",
      "هل تفضل الأنشطة الجماعية أم الفردية؟",
      "ما هو أكثر مكان تحب زيارته في مدينتك؟",
      // Added questions
      "ما هو آخر نشاط جديد جربته؟",
      "هل تفضل القراءة أم مشاهدة الأفلام؟",
      "ما هو نوع الرياضة الذي تستمتع به أكثر؟",
      "هل لديك موهبة خفية؟",
      "ما هو أكثر شيء تحب تعلمه؟",
      "ما هو أكثر مشروع شخصي فخور به؟",
      "هل تفضل المغامرات أم الاسترخاء؟",
      "ما هو أكثر شيء يجعلك تشعر بالإبداع؟",
      "ما هو أكثر نشاط تفعله مع أصدقائك؟",
      "هل لديك مجموعة مفضلة من الكتب أو الأفلام؟",
      "ما هو أكثر شيء تحب جمعه أو اقتناؤه؟",
      "ما هو أكثر مكان ألهمك؟",
      "هل لديك روتين يومي مميز؟",
      "ما هو أكثر شيء تتمنى إتقانه؟",
      "ما هو أكثر نشاط يجعلك تنسى الوقت؟"
    ],
  },
  {
    id: "values",
    title: "القيم والمبادئ",
    depth: "medium",
    icon: <Gem className="w-5 h-5 text-green-500" />,
    questions: [
      "ما هي القيم التي تعتبرها أساسية في حياتك؟",
      "هل هناك مبدأ لا تتنازل عنه أبداً؟",
      "كيف تتعامل مع الاختلاف في وجهات النظر؟",
      "ما هو أهم درس تعلمته في حياتك؟",
      // Added questions
      "ما هو الموقف الذي غيّر نظرتك للحياة؟",
      "ما هي الصفة التي تعتز بها في نفسك؟",
      "ما هو القرار الذي اتخذته بناءً على قناعتك الشخصية؟",
      "كيف تعبر عن احترامك للآخرين؟",
      "ما هو أكثر موقف شعرت فيه بالفخر بنفسك؟",
      "ما هو المبدأ الذي تتمنى أن يلتزم به الجميع؟",
      "كيف تتعامل مع الفشل؟",
      "ما هو الشيء الذي لا يمكنك التسامح فيه؟",
      "ما هو أكثر شيء تعلمته من عائلتك؟",
      "ما هو الموقف الذي اختبرت فيه صدقك؟",
      "ما هو أكثر شيء تراه ضرورياً في الصداقة؟",
      "كيف تعبر عن امتنانك؟",
      "ما هو أكثر قرار صعب اتخذته؟",
      "ما هو الشيء الذي تغير فيك مع مرور الوقت؟",
      "ما هو أكثر شيء يجعلك تشعر بالرضا عن نفسك؟",
      "ما هو المبدأ الذي تتمنى أن يتبعه الجيل القادم؟"
    ],
  },
  {
    id: "relationships",
    title: "العلاقات والتواصل",
    depth: "medium",
    icon: <Users className="w-5 h-5 text-green-500" />,
    questions: [
      "ما الذي تبحث عنه في صديق أو شريك؟",
      "كيف تعبر عن مشاعرك عادةً؟",
      "ما هو أفضل نصيحة تلقيتها عن العلاقات؟",
      "هل تفضل الصراحة أم المجاملة في التواصل؟",
      // Added questions
      "ما هو أكثر شيء يهمك في العلاقة؟",
      "كيف تتعامل مع الخلافات؟",
      "ما هو أكثر موقف دعمك فيه صديق؟",
      "ما هو الشيء الذي يجعلك تشعر بالأمان مع الآخرين؟",
      "ما هو أكثر شيء تقدره في شريك حياتك أو أصدقائك؟",
      "ما هو أكثر شيء تعلمته من علاقة سابقة؟",
      "كيف تعبر عن تقديرك للآخرين؟",
      "ما هو أكثر موقف شعرت فيه بالوحدة؟",
      "ما هو أكثر شيء يجعلك تثق في شخص ما؟",
      "ما هو أكثر شيء يجعلك تبتعد عن شخص؟",
      "ما هو أكثر شيء يجعلك تضحك مع أصدقائك؟",
      "ما هو أكثر شيء يجعلك تشعر بالانتماء؟",
      "ما هو أكثر شيء يجعلك تعتذر؟",
      "ما هو أكثر شيء يجعلك تسامح؟",
      "ما هو أكثر شيء يجعلك تشتاق لشخص؟",
      "ما هو أكثر شيء يجعلك تشعر بالسعادة في العلاقة؟"
    ],
  },
  {
    id: "dreams",
    title: "الأحلام والطموحات",
    depth: "deep",
    icon: <Rocket className="w-5 h-5 text-purple-500" />,
    questions: [
      "ما هو أكبر حلم تسعى لتحقيقه؟",
      "ما هي العقبة الأكبر التي واجهتها في طريقك؟",
      "كيف تتخيل حياتك بعد خمس سنوات؟",
      "ما الذي يلهمك للاستمرار في السعي؟",
      // Added questions
      "ما هو الهدف الذي تعمل عليه حالياً؟",
      "ما هو أكثر شيء تخاف أن تندم عليه؟",
      "ما هو أكثر شيء تتمنى تحقيقه قبل سن الثلاثين/الأربعين؟",
      "ما هو أكثر شيء يجعلك تشعر بالحماس للمستقبل؟",
      "ما هو أكثر تحدي تغلبت عليه؟",
      "ما هو أكثر شيء تتمنى تغييره في العالم؟",
      "ما هو أكثر شيء يجعلك تشعر بالفخر بنفسك؟",
      "ما هو أكثر شيء تتمنى أن تتعلمه؟",
      "ما هو أكثر شيء يجعلك تستمر رغم الصعوبات؟",
      "ما هو أكثر شيء تتمنى أن يعرفه الناس عنك؟",
      "ما هو أكثر شيء يجعلك تشعر بالإنجاز؟",
      "ما هو أكثر شيء تتمنى أن تفعله لو لم يكن هناك حدود؟",
      "ما هو أكثر شيء يجعلك تشعر بالحرية؟",
      "ما هو أكثر شيء تتمنى أن تتركه إرثاً؟",
      "ما هو أكثر شيء يجعلك تشعر بالرضا عن حياتك؟",
      "ما هو أكثر شيء تتمنى أن تحققه في السنوات القادمة؟"
    ],
  },
  {
    id: "philosophy",
    title: "أسئلة عميقة وفلسفية",
    depth: "deep",
    icon: <Brain className="w-5 h-5 text-purple-500" />,
    questions: [
      "ما هو معنى السعادة بالنسبة لك؟",
      "هل تؤمن أن كل شيء يحدث لسبب؟",
      "ما هو تعريفك للنجاح؟",
      "كيف تتعامل مع التغيير في حياتك؟",
      // Added questions
      "ما هو الشيء الذي تعتقد أنه لا يمكن شرحه بالكلمات؟",
      "ما هو أكثر سؤال فلسفي يشغل بالك؟",
      "هل تعتقد أن الإنسان حر أم مقيد؟",
      "ما هو أكثر شيء يجعلك تتأمل في الحياة؟",
      "ما هو أكثر شيء يجعلك تشعر بالدهشة؟",
      "ما هو أكثر شيء تتمنى فهمه؟",
      "ما هو أكثر شيء يجعلك تشعر بالسلام الداخلي؟",
      "ما هو أكثر شيء يجعلك تشعر بالانتماء للعالم؟",
      "ما هو أكثر شيء يجعلك تشعر بالغموض؟",
      "ما هو أكثر شيء يجعلك تتساءل عن وجودك؟",
      "ما هو أكثر شيء يجعلك تعيد التفكير في معتقداتك؟",
      "ما هو أكثر شيء يجعلك تشعر بالزمن؟",
      "ما هو أكثر شيء يجعلك تؤمن بالحب؟",
      "ما هو أكثر شيء يجعلك تشعر بالوحدة؟",
      "ما هو أكثر شيء يجعلك تتمنى لو كنت شخصاً آخر؟",
      "ما هو أكثر شيء يجعلك تشعر بالامتنان للحياة؟"
    ],
  },
  {
    id: "scenarios",
    title: "أسئلة مواقف افتراضية",
    depth: "medium",
    icon: <HelpCircle className="w-5 h-5 text-green-500" />,
    questions: [
      "لو استيقظت فجأة في بلد جديد، ما أول شيء ستفعله؟",
      "لو ربحت مليون دولار، كيف ستتصرف؟",
      "لو كان بإمكانك تناول العشاء مع أي شخصية تاريخية، من ستختار؟",
      "لو كان عليك العيش في جزيرة نائية لمدة شهر، ما الأشياء الثلاثة التي ستأخذها معك؟",
      "لو كان بإمكانك تغيير قرار واحد في حياتك، ما هو؟",
      "لو فقدت هاتفك في مدينة غريبة، كيف ستتصرف؟",
      "لو كان عليك اختيار مهنة جديدة تماماً، ماذا ستختار؟",
      "لو كان بإمكانك امتلاك قدرة خارقة ليوم واحد، ماذا ستختار ولماذا؟",
      "لو اضطررت للانتقال إلى مدينة جديدة غداً، ما أول شيء ستبحث عنه؟",
      "لو كان عليك أن تعيش يوماً كاملاً كشخص آخر، من ستختار؟",
      "لو كان بإمكانك العودة بالزمن وتغيير لحظة واحدة، ما هي؟",
      "لو كان عليك اتخاذ قرار صعب بين الصداقة والعمل، ماذا ستفعل؟",
      "لو وجدت حقيبة مليئة بالمال في الشارع، ماذا ستفعل؟",
      "لو كان عليك أن تبدأ من الصفر في بلد جديد، كيف ستبني حياتك؟",
      "لو كان بإمكانك قضاء يوم كامل بدون أي تقنية، كيف ستقضيه؟",
      "لو كان عليك أن تقدم نصيحة لنفسك قبل عشر سنوات، ماذا ستقول؟",
      "لو كان عليك أن تختار بين الشهرة أو الخصوصية، ماذا ستختار؟",
      "لو كان بإمكانك تغيير شيء واحد في العالم، ما هو؟",
      "لو كان عليك أن تتخذ قراراً مصيرياً في لحظة، كيف ستتصرف؟",
      "لو كان عليك أن تعيش في عصر مختلف، أي عصر ستختار ولماذا؟"
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
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogContent
          className={`max-w-xl w-full sm:max-w-xl sm:w-full w-[95vw] max-w-full rounded-xl p-0 overflow-hidden border border-slate-200 dark:border-slate-700 fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 ${dark ? "bg-slate-900 text-white" : "bg-white text-gray-900"}`}
          dir="rtl"
          aria-label="أسئلة للنقاش"
        >
        <DialogHeader className="flex flex-row items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-2 border-b border-slate-200 dark:border-slate-700 z-10 relative bg-inherit sticky top-0">
          <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-500" />
            أسئلة للنقاش
          </DialogTitle>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full" aria-label="إغلاق الأسئلة">
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>
        {/* Depth Stepper - subtle accent only */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 pt-3 pb-2 z-10 relative">
          {depthOrder.map((depth, idx) => (
            <div key={depth} className="flex-1 flex flex-col items-center">
              <div
                className={`w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border transition-all duration-300 ${
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
                <Sparkles className={`w-5 h-5 sm:w-4 sm:h-4 ${depth === "shallow" ? "text-cyan-400" : depth === "medium" ? "text-green-400" : "text-purple-400"}`} />
              </div>
              <span className={`mt-1 text-[11px] sm:text-xs font-medium ${selectedTopic && selectedTopic.depth === depth ? "text-cyan-500" : dark ? "text-slate-400" : "text-gray-500"}`}>{depthLabels[depth]}</span>
            </div>
          ))}
        </div>
        <div className="p-3 sm:p-6 pt-2 min-h-[300px] sm:min-h-[350px] max-h-[70vh] sm:max-h-[70vh] max-h-[65vh] overflow-y-auto z-10 relative" tabIndex={0}>
          {!selectedTopic ? (
            <>
              <div className="mb-4 sm:mb-6 text-center">
                <p className="text-sm sm:text-base font-medium opacity-80">اختر موضوعاً لبدء النقاش. المواضيع مرتبة من الأسهل إلى الأعمق.</p>
              </div>
              <div className="space-y-4 sm:space-y-6">
                {depthOrder.map(depth => (
                  <div key={depth}>
                    <div className={`mb-2 text-xs sm:text-sm font-bold ${depth === "shallow" ? "text-cyan-500" : depth === "medium" ? "text-green-500" : "text-purple-500"}`}>{depthLabels[depth]}</div>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      {promptTopics.filter(t => t.depth === depth).map(topic => (
                        <button
                          key={topic.id}
                          className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border font-semibold text-sm sm:text-base transition-all duration-200 hover:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 ${
                            depth === "shallow"
                              ? "bg-white dark:bg-slate-900 border-cyan-100 dark:border-slate-700 text-cyan-800 dark:text-cyan-300"
                              : depth === "medium"
                              ? "bg-white dark:bg-slate-900 border-green-100 dark:border-slate-700 text-green-800 dark:text-green-300"
                              : "bg-white dark:bg-slate-900 border-purple-100 dark:border-slate-700 text-purple-800 dark:text-purple-300"
                          } w-[90vw] max-w-xs sm:w-auto sm:max-w-none`}
                          onClick={() => setSelectedTopic(topic)}
                          aria-label={`اختر موضوع: ${topic.title}`}
                        >
                          {topic.icon}
                          <span className="whitespace-nowrap overflow-hidden text-ellipsis w-full text-right">{topic.title}</span>
                          <ChevronLeft className="w-4 h-4 opacity-60" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Topic header now outside scrollable area, directly under stepper */}
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-lg py-2">
                <Button variant="ghost" size="icon" onClick={() => setSelectedTopic(null)} className="rounded-full" aria-label="رجوع للمواضيع">
                  <ArrowLeftCircle className="w-6 h-6 text-cyan-500" />
                </Button>
                <span className="text-base sm:text-lg font-bold flex items-center gap-2">{selectedTopic.icon} {selectedTopic.title}</span>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[60vh] scrollbar-hide">
                {selectedTopic.questions.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 text-base sm:text-lg font-semibold text-cyan-500">لا توجد أسئلة لهذا الموضوع بعد.</div>
                ) : (
                  selectedTopic.questions.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 sm:p-3 rounded border bg-black/20 border-white/10 shadow-sm transition-all duration-200 group backdrop-blur-sm"
                      tabIndex={0}
                      aria-label={`سؤال ${i + 1}: ${q}`}
                    >
                      <span className="font-bold text-sm sm:text-base text-cyan-400 w-6 text-center">{i + 1}.</span>
                      <span className="flex-1 text-sm sm:text-base text-slate-600">{q}</span>
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
                  ))
                )}
              </div>
            </>
          )}
        </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
} 