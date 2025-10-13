import React, { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, MessageSquare, ArrowLeftCircle, CheckCircle, Star, Flame, HelpCircle, Heart, Gem, Users, Rocket, Brain, Copy, Shuffle, Filter, Search } from "lucide-react";
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
      "ما هو أفضل كتاب أو فيلم شاهدته مؤخراً؟",
      "ما هو أكثر شيء يجعلك تضحك؟",
      "ما هو طعامك المفضل ولماذا؟",
      "هل تفضل الصباح أم المساء؟",
      "ما هي أغرب تجربة مررت بها؟",
      "ما هو المكان الذي تشعر فيه بالراحة دائماً؟",
      "ما هي أغنيتك المفضلة حالياً؟",
      "هل لديك عادة غريبة؟",
      "ما هو أكثر موقف محرج تعرضت له؟",
      "لو كان بإمكانك مقابلة أي شخصية مشهورة، من ستختار؟",
      "ما هو أكثر شيء تفتقده من طفولتك؟",
      "ما هو أفضل احتفال حضرته؟",
      "ما هو الشيء الذي لا يمكنك العيش بدونه؟",
      "ما هو أكثر شيء يثير فضولك؟",
      "ما هو أكثر قرار عفوي اتخذته؟",
      "ما هو أكثر مكان زرته وترك انطباعاً قوياً؟",
      "ما هو أكثر شيء تحب تجربته في المطاعم؟",
      "ما هو أكثر موقف مضحك حدث لك؟",
      "ما هو أكثر شيء يجعلك تبتسم؟",
      "ما هو أكثر شيء تحب اكتشافه في مدينة جديدة؟",
      "ما هو أول شيء تفعله في الصباح؟",
      "ما هو آخر شيء يجعلك تنام مرتاحاً؟",
      "ما هو أكثر شيء تحب شراءه؟",
      "ما هي أفضل نصيحة تلقيتها؟",
      "ما هو أكثر شيء تحب الحديث عنه؟",
      "ما هو أكثر لون يعجبك ولماذا؟",
      "ما هو أكثر موسم تحبه في السنة؟",
      "ما هو أكثر شيء تحب تناوله في الإفطار؟",
      "ما هي أفضل ذكرى لديك من المدرسة؟",
      "ما هو أكثر شيء تحب فعله في المساء؟"
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
      "ما هو أكثر نشاط يجعلك تنسى الوقت؟",
      "ما هو أكثر شيء تحب تعلمه من الإنترنت؟",
      "ما هو أكثر مشروع تحلم بتنفيذه؟",
      "ما هو أكثر شيء تحب فعله في الطبيعة؟",
      "ما هو أكثر نشاط يجعلك تشعر بالإنجاز؟",
      "ما هو أكثر شيء تحب مشاهدته على الإنترنت؟",
      "ما هو أكثر شيء تحب القراءة عنه؟",
      "ما هو أكثر نشاط تحب ممارسته في الصباح؟",
      "ما هو أكثر شيء تحب تجربته في السفر؟",
      "ما هو أكثر شيء يلهمك للإبداع؟",
      "ما هو أكثر نشاط تحب مشاركته مع العائلة؟"
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
      "ما هو المبدأ الذي تتمنى أن يتبعه الجيل القادم؟",
      "ما هو أكثر موقف اختبرت فيه قيمك الحقيقية؟",
      "ما هو أكثر شيء تعلمته من تجربة صعبة؟",
      "ما هو أكثر شيء تقدره في الحياة؟",
      "ما هو أكثر موقف شعرت فيه بالفخر بقرارك؟",
      "ما هو أكثر شيء تتمنى أن يتغير في المجتمع؟",
      "ما هو أكثر شيء يجعلك تشعر بالمسؤولية؟",
      "ما هو أكثر موقف تعلمت فيه درساً قيماً؟",
      "ما هو أكثر شيء تتمسك به في الأوقات الصعبة؟",
      "ما هو أكثر شيء يجعلك تشعر بالصدق مع نفسك؟",
      "ما هو أكثر قيمة تتمنى أن يتعلمها أطفالك؟"
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
      "ما هو أكثر شيء يجعلك تشعر بالسعادة في العلاقة؟",
      "ما هو أكثر شيء تبحث عنه في الصداقة الحقيقية؟",
      "ما هو أكثر موقف أظهر لك قيمة الصداقة؟",
      "ما هو أكثر شيء يجعلك تشعر بالراحة مع شخص ما؟",
      "ما هو أكثر شيء تقدره في التواصل مع الآخرين؟",
      "ما هو أكثر موقف تعلمت فيه عن نفسك من خلال علاقة؟",
      "ما هو أكثر شيء يجعلك تشعر بالتقدير من الآخرين؟",
      "ما هو أكثر شيء يجعلك تبني الثقة مع شخص؟",
      "ما هو أكثر شيء تحب فعله مع أصدقائك المقربين؟",
      "ما هو أكثر شيء يجعلك تشعر بالدعم من الآخرين؟",
      "ما هو أكثر شيء تتمنى أن يفهمه الناس عنك في العلاقات؟"
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
      "ما هو أكثر شيء تتمنى أن تحققه في السنوات القادمة؟",
      "ما هو أكثر حلم يراودك منذ الطفولة؟",
      "ما هو أكثر إنجاز تفتخر بتحقيقه حتى الآن؟",
      "ما هو أكثر شيء يدفعك للاستمرار في السعي؟",
      "ما هو أكثر شيء تتمنى أن تكون قدوة فيه للآخرين؟",
      "ما هو أكثر طموح يجعلك تستيقظ كل يوم؟",
      "ما هو أكثر شيء تتمنى أن تحققه لعائلتك؟",
      "ما هو أكثر هدف يجعلك تشعر بالحماس؟",
      "ما هو أكثر شيء تتمنى أن تغيره في نفسك؟",
      "ما هو أكثر حلم يجعلك تشعر بالسعادة عند التفكير فيه؟",
      "ما هو أكثر شيء تتمنى أن يعرفه الناس عن أحلامك؟"
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
      "ما هو أكثر شيء يجعلك تشعر بالامتنان للحياة؟",
      "ما هو أكثر سؤال وجودي يشغل تفكيرك؟",
      "ما هو أكثر شيء يجعلك تشعر بالحكمة؟",
      "ما هو أكثر شيء تعتقد أنه يعطي معنى للحياة؟",
      "ما هو أكثر شيء يجعلك تتأمل في الكون؟",
      "ما هو أكثر شيء يجعلك تشعر بالتواضع؟",
      "ما هو أكثر شيء تعتقد أنه يستحق التضحية؟",
      "ما هو أكثر شيء يجعلك تشعر بالروحانية؟",
      "ما هو أكثر شيء تعتقد أنه يجمع البشرية؟",
      "ما هو أكثر شيء يجعلك تشعر بالسكينة؟",
      "ما هو أكثر شيء تعتقد أنه يبقى بعد الموت؟"
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
      "لو كان عليك أن تعيش في عصر مختلف، أي عصر ستختار ولماذا؟",
      "لو كان بإمكانك تعلم أي لغة بطلاقة فورية، أي لغة ستختار؟",
      "لو كان عليك أن تختار بين السفر للماضي أو المستقبل، ماذا ستختار؟",
      "لو كان بإمكانك العيش في أي مدينة في العالم، أين ستعيش؟",
      "لو كان عليك أن تختار مهنة أحلامك بدون قيود مالية، ماذا ستختار؟",
      "لو كان بإمكانك قضاء يوم مع أي شخصية، من ستختار؟",
      "لو كان عليك أن تعيش بدون أحد حواسك، أي حاسة ستختار؟",
      "لو كان بإمكانك تغيير حدث واحد في التاريخ، ماذا ستغير؟",
      "لو كان عليك أن تختار بين الثروة أو الصحة، ماذا ستختار؟",
      "لو كان بإمكانك امتلاك أي موهبة، ماذا ستختار؟",
      "لو كان عليك أن تعيش في عالم خيالي، أي عالم ستختار؟"
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

export default function PromptTopicsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selectedTopic, setSelectedTopic] = useState<null | typeof promptTopics[0]>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepth, setSelectedDepth] = useState<keyof typeof depthLabels | "all">("all");
  const [randomQuestion, setRandomQuestion] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Filter questions based on search and depth
  const filteredQuestions = selectedTopic ? 
    selectedTopic.questions.filter(q => 
      q.toLowerCase().includes(searchQuery.toLowerCase())
    ) : [];

  // Get random question from current topic
  const getRandomQuestion = () => {
    if (!selectedTopic || selectedTopic.questions.length === 0) return;
    
    setIsAnimating(true);
    const randomIndex = Math.floor(Math.random() * selectedTopic.questions.length);
    const question = selectedTopic.questions[randomIndex];
    
    setTimeout(() => {
      setRandomQuestion(question);
      setIsAnimating(false);
    }, 300);
  };

  // Reset states when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedTopic(null);
      setSearchQuery("");
      setSelectedDepth("all");
      setRandomQuestion(null);
    }
  }, [open]);

  // Scroll to top when selecting a new topic
  useEffect(() => {
    if (selectedTopic) {
      const contentArea = document.querySelector('[data-scroll-container]');
      if (contentArea) {
        contentArea.scrollTop = 0;
      }
    }
  }, [selectedTopic]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogContent
          className="w-[95vw] max-w-4xl h-[90vh] max-h-[800px] rounded-2xl p-0 overflow-hidden border-0 shadow-2xl fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white"
          dir="rtl"
          aria-label="أسئلة للنقاش"
        >
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 animate-pulse"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.1),transparent_50%)]"></div>
        </div>

        {/* Modern Header - Mobile Optimized */}
        <DialogHeader className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 bg-gradient-to-r from-slate-800/80 to-slate-700/80 backdrop-blur-xl border-b border-slate-600/30 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg sm:text-2xl font-bold flex items-center gap-2 sm:gap-3">
              <div className="relative">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 flex items-center justify-center shadow-lg">
                  <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-gradient-to-r from-pink-500 to-orange-500 rounded-full animate-pulse"></div>
              </div>
              <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                أسئلة للنقاش
              </span>
            </DialogTitle>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose} 
              className="rounded-xl hover:bg-slate-700/50 transition-all duration-300 hover:scale-110 w-8 h-8 sm:w-10 sm:h-10" 
              aria-label="إغلاق الأسئلة"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300 hover:text-white" />
            </Button>
          </div>
          
          {/* Subtitle - Hidden on small screens */}
          <p className="text-slate-300 text-xs sm:text-sm mt-1 sm:mt-2 opacity-80 hidden sm:block">
            اختر موضوعاً واستكشف أسئلة متنوعة لإثراء المحادثة
          </p>
        </DialogHeader>

        {/* Modern Navigation Bar - Mobile Optimized */}
        {selectedTopic && (
          <div className="relative z-10 px-4 sm:px-6 py-3 sm:py-4 bg-slate-800/50 backdrop-blur-xl border-b border-slate-600/30 flex-shrink-0">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <Button 
                variant="ghost" 
                onClick={() => setSelectedTopic(null)} 
                className="flex items-center gap-1 sm:gap-2 hover:bg-slate-700/50 rounded-xl transition-all duration-300 text-sm sm:text-base px-2 sm:px-3 py-1 sm:py-2"
              >
                <ArrowLeftCircle className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
                <span className="text-slate-300 hidden sm:inline">العودة للمواضيع</span>
                <span className="text-slate-300 sm:hidden">عودة</span>
              </Button>
              
              <div className="flex items-center gap-2 sm:gap-3">
                <Button
                  variant="ghost"
                  onClick={getRandomQuestion}
                  className="flex items-center gap-1 sm:gap-2 hover:bg-purple-600/20 rounded-xl transition-all duration-300 text-sm sm:text-base px-2 sm:px-3 py-1 sm:py-2"
                  disabled={isAnimating}
                >
                  <Shuffle className={`w-3 h-3 sm:w-4 sm:h-4 text-purple-400 ${isAnimating ? 'animate-spin' : ''}`} />
                  <span className="text-purple-300 hidden sm:inline">سؤال عشوائي</span>
                  <span className="text-purple-300 sm:hidden">عشوائي</span>
                </Button>
              </div>
            </div>
            
            {/* Topic Header - Mobile Optimized */}
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${
                selectedTopic.depth === "shallow" ? 'bg-gradient-to-r from-cyan-500 to-blue-500' :
                selectedTopic.depth === "medium" ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                'bg-gradient-to-r from-purple-500 to-pink-500'
              } shadow-lg`}>
                {React.cloneElement(selectedTopic.icon, { className: "w-4 h-4 sm:w-5 sm:h-5 text-white" })}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-xl font-bold text-white truncate">{selectedTopic.title}</h3>
                <p className={`text-xs sm:text-sm ${
                  selectedTopic.depth === "shallow" ? 'text-cyan-300' :
                  selectedTopic.depth === "medium" ? 'text-green-300' :
                  'text-purple-300'
                }`}>
                  {depthLabels[selectedTopic.depth as keyof typeof depthLabels]} • {selectedTopic.questions.length} سؤال
                </p>
              </div>
            </div>
            
            {/* Search Bar - Mobile Optimized */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-slate-400" />
              <input
                type="text"
                placeholder="ابحث في الأسئلة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-8 sm:px-10 py-2 sm:py-3 text-sm sm:text-base text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400/50 transition-all duration-300"
              />
            </div>
          </div>
        )}

        {/* Main Content Area - Mobile Optimized with Scroll Container */}
        <div 
          className="relative z-10 flex-1 overflow-y-auto custom-scrollbar" 
          data-scroll-container
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(71, 85, 105, 0.8) rgba(30, 41, 59, 0.5)',
          }}
        >
          <div className="p-4 sm:p-6">
            {!selectedTopic ? (
              <>
                {/* Modern Topic Selection - Mobile Optimized */}
                <div className="space-y-6 sm:space-y-8">
                  {depthOrder.map(depth => (
                    <div key={depth} className="space-y-3 sm:space-y-4">
                      {/* Depth Header - Mobile Optimized */}
                      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                        <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center ${
                          depth === "shallow" ? 'bg-gradient-to-r from-cyan-500 to-blue-500' :
                          depth === "medium" ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                          'bg-gradient-to-r from-purple-500 to-pink-500'
                        } shadow-lg`}>
                          <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                        </div>
                        <h3 className={`text-base sm:text-lg font-bold ${
                          depth === "shallow" ? "text-cyan-400" : 
                          depth === "medium" ? "text-green-400" : 
                          "text-purple-400"
                        }`}>
                          {depthLabels[depth]}
                        </h3>
                        <div className="flex-1 h-px bg-gradient-to-r from-slate-600 to-transparent"></div>
                      </div>

                      {/* Topic Cards Grid - Mobile Optimized */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {promptTopics.filter(t => t.depth === depth).map(topic => (
                          <button
                            key={topic.id}
                            onClick={() => setSelectedTopic(topic)}
                            className={`group relative p-4 sm:p-6 rounded-xl sm:rounded-2xl border transition-all duration-300 hover:scale-105 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                              depth === "shallow"
                                ? "bg-gradient-to-br from-slate-800/80 to-slate-700/80 border-cyan-500/30 hover:border-cyan-400 focus:ring-cyan-400/50"
                                : depth === "medium"
                                ? "bg-gradient-to-br from-slate-800/80 to-slate-700/80 border-green-500/30 hover:border-green-400 focus:ring-green-400/50"
                                : "bg-gradient-to-br from-slate-800/80 to-slate-700/80 border-purple-500/30 hover:border-purple-400 focus:ring-purple-400/50"
                            }`}
                          >
                            {/* Card Background Effect */}
                            <div className={`absolute inset-0 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${
                              depth === "shallow" ? 'bg-gradient-to-br from-cyan-500 to-blue-500' :
                              depth === "medium" ? 'bg-gradient-to-br from-green-500 to-emerald-500' :
                              'bg-gradient-to-br from-purple-500 to-pink-500'
                            }`}></div>
                            
                            <div className="relative z-10">
                              <div className="flex items-center justify-between mb-2 sm:mb-3">
                                <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center ${
                                  depth === "shallow" ? 'bg-gradient-to-r from-cyan-500 to-blue-500' :
                                  depth === "medium" ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                                  'bg-gradient-to-r from-purple-500 to-pink-500'
                                } shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                  {React.cloneElement(topic.icon, { className: "w-4 h-4 sm:w-5 sm:h-5 text-white" })}
                                </div>
                                <ChevronLeft className={`w-4 h-4 sm:w-5 sm:h-5 opacity-60 group-hover:opacity-100 transition-all duration-300 ${
                                  depth === "shallow" ? 'text-cyan-400' :
                                  depth === "medium" ? 'text-green-400' :
                                  'text-purple-400'
                                }`} />
                              </div>
                              
                              <h4 className="text-sm sm:text-lg font-bold text-white mb-2 text-right leading-tight">
                                {topic.title}
                              </h4>
                              
                              <div className="flex items-center justify-between text-sm">
                                <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
                                  depth === "shallow" ? 'bg-cyan-500/20 text-cyan-300' :
                                  depth === "medium" ? 'bg-green-500/20 text-green-300' :
                                  'bg-purple-500/20 text-purple-300'
                                }`}>
                                  {topic.questions.length} سؤال
                                </span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Random Question Highlight - Mobile Optimized */}
                {randomQuestion && (
                  <div className={`mb-4 sm:mb-6 p-4 sm:p-6 rounded-xl sm:rounded-2xl border-2 ${
                    selectedTopic.depth === "shallow" ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-400/50' :
                    selectedTopic.depth === "medium" ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-400/50' :
                    'bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-400/50'
                  } shadow-xl ${isAnimating ? 'animate-pulse' : ''}`}>
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${
                        selectedTopic.depth === "shallow" ? 'bg-gradient-to-r from-cyan-500 to-blue-500' :
                        selectedTopic.depth === "medium" ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                        'bg-gradient-to-r from-purple-500 to-pink-500'
                      } shadow-lg`}>
                        <Star className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                      </div>
                      <h4 className={`text-base sm:text-lg font-bold ${
                        selectedTopic.depth === "shallow" ? 'text-cyan-400' :
                        selectedTopic.depth === "medium" ? 'text-green-400' :
                        'text-purple-400'
                      }`}>
                        السؤال المقترح
                      </h4>
                    </div>
                    <p className="text-white text-base sm:text-lg leading-relaxed mb-3 sm:mb-4">{randomQuestion}</p>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(randomQuestion);
                        setCopiedIndex(-1);
                        setTimeout(() => setCopiedIndex(null), 1200);
                      }}
                      className={`flex items-center gap-2 text-sm sm:text-base ${
                        selectedTopic.depth === "shallow" ? 'hover:bg-cyan-500/20 text-cyan-300' :
                        selectedTopic.depth === "medium" ? 'hover:bg-green-500/20 text-green-300' :
                        'hover:bg-purple-500/20 text-purple-300'
                      } rounded-xl transition-all duration-300 px-3 py-2`}
                    >
                      <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span>نسخ السؤال</span>
                      {copiedIndex === -1 && (
                        <span className="text-green-400 text-xs sm:text-sm">✓ تم النسخ</span>
                      )}
                    </Button>
                  </div>
                )}

                {/* Questions Grid - Mobile Optimized */}
                <div className="space-y-2 sm:space-y-3">
                  {filteredQuestions.length === 0 ? (
                    <div className="text-center py-8 sm:py-12">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-slate-700/50 flex items-center justify-center">
                        <Search className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                      </div>
                      <p className="text-slate-400 text-base sm:text-lg">
                        {searchQuery ? 'لا توجد أسئلة تطابق البحث' : 'لا توجد أسئلة لهذا الموضوع'}
                      </p>
                    </div>
                  ) : (
                    filteredQuestions.map((q, i) => (
                      <div
                        key={i}
                        className={`group relative p-3 sm:p-4 rounded-lg sm:rounded-xl border transition-all duration-300 hover:scale-[1.01] sm:hover:scale-[1.02] hover:shadow-lg ${
                          selectedTopic.depth === "shallow"
                            ? "bg-slate-800/50 border-slate-700/50 hover:border-cyan-400/50 hover:bg-slate-800/70"
                            : selectedTopic.depth === "medium"
                            ? "bg-slate-800/50 border-slate-700/50 hover:border-green-400/50 hover:bg-slate-800/70"
                            : "bg-slate-800/50 border-slate-700/50 hover:border-purple-400/50 hover:bg-slate-800/70"
                        }`}
                      >
                        {/* Question Number Badge - Mobile Optimized */}
                        <div className={`absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold text-white shadow-lg ${
                          selectedTopic.depth === "shallow" ? 'bg-gradient-to-r from-cyan-500 to-blue-500' :
                          selectedTopic.depth === "medium" ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                          'bg-gradient-to-r from-purple-500 to-pink-500'
                        }`}>
                          {selectedTopic.questions.indexOf(q) + 1}
                        </div>

                        <div className="flex items-start gap-2 sm:gap-4 pr-2 sm:pr-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm sm:text-base leading-relaxed">{q}</p>
                          </div>
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(q);
                              setCopiedIndex(i);
                              setTimeout(() => setCopiedIndex(null), 1200);
                            }}
                            className={`relative rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-110 flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 ${
                              selectedTopic.depth === "shallow" ? 'hover:bg-cyan-500/20 text-cyan-400' :
                              selectedTopic.depth === "medium" ? 'hover:bg-green-500/20 text-green-400' :
                              'hover:bg-purple-500/20 text-purple-400'
                            }`}
                          >
                            <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                            {copiedIndex === i && (
                              <div className="absolute -top-8 sm:-top-10 right-0 bg-green-500 text-white text-xs rounded-lg px-2 sm:px-3 py-1 shadow-lg animate-in slide-in-from-bottom-2 duration-200 whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="w-2 h-2 sm:w-3 sm:h-3" />
                                  <span>تم النسخ!</span>
                                </div>
                              </div>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
} 