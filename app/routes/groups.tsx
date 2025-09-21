import React, { useState, useEffect } from "react";
import { 
  Users, 
  Play, 
  ChevronRight, 
  ChevronLeft,
  Trophy,
  Star,
  Heart,
  Target,
  MessageSquare,
  Sparkles,
  X,
  ArrowLeftCircle,
  CheckCircle,
  Brain,
  Gem,
  Rocket,
  HelpCircle
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";

interface Game {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: React.ReactNode;
  color: string;
}

// Story building blocks
interface StoryBlock {
  id: string;
  type: 'character' | 'setting' | 'object' | 'action' | 'emotion' | 'twist';
  text: string;
  used: boolean;
}

const storyBlocks: StoryBlock[] = [
  // Characters
  { id: '1', type: 'character', text: 'طبيب شاب', used: false },
  { id: '2', type: 'character', text: 'عجوز حكيم', used: false },
  { id: '3', type: 'character', text: 'طفلة فضولية', used: false },
  { id: '4', type: 'character', text: 'تاجر مسافر', used: false },
  { id: '5', type: 'character', text: 'فنان مبدع', used: false },
  { id: '6', type: 'character', text: 'معلمة صبورة', used: false },
  
  // Settings
  { id: '7', type: 'setting', text: 'في مكتبة قديمة', used: false },
  { id: '8', type: 'setting', text: 'على قمة جبل', used: false },
  { id: '9', type: 'setting', text: 'في سوق شعبي', used: false },
  { id: '10', type: 'setting', text: 'بجانب البحر', used: false },
  { id: '11', type: 'setting', text: 'في حديقة سرية', used: false },
  { id: '12', type: 'setting', text: 'داخل قطار قديم', used: false },
  
  // Objects
  { id: '13', type: 'object', text: 'خريطة غامضة', used: false },
  { id: '14', type: 'object', text: 'مفتاح ذهبي', used: false },
  { id: '15', type: 'object', text: 'رسالة قديمة', used: false },
  { id: '16', type: 'object', text: 'صندوق موسيقي', used: false },
  { id: '17', type: 'object', text: 'كتاب سحري', used: false },
  { id: '18', type: 'object', text: 'بوصلة مكسورة', used: false },
  
  // Actions
  { id: '19', type: 'action', text: 'اكتشف سراً', used: false },
  { id: '20', type: 'action', text: 'التقى بصديق قديم', used: false },
  { id: '21', type: 'action', text: 'وجد كنزاً مدفوناً', used: false },
  { id: '22', type: 'action', text: 'سمع صوتاً غريباً', used: false },
  { id: '23', type: 'action', text: 'فقد طريقه', used: false },
  { id: '24', type: 'action', text: 'حل لغزاً معقداً', used: false },
  
  // Emotions
  { id: '25', type: 'emotion', text: 'شعر بالحنين', used: false },
  { id: '26', type: 'emotion', text: 'امتلأ بالأمل', used: false },
  { id: '27', type: 'emotion', text: 'أحس بالخوف', used: false },
  { id: '28', type: 'emotion', text: 'فرح فرحاً عظيماً', used: false },
  { id: '29', type: 'emotion', text: 'شعر بالحيرة', used: false },
  { id: '30', type: 'emotion', text: 'امتلأ بالفضول', used: false },
  
  // Twists
  { id: '31', type: 'twist', text: 'لكن كان هناك شيء مخفي', used: false },
  { id: '32', type: 'twist', text: 'فجأة تغير كل شيء', used: false },
  { id: '33', type: 'twist', text: 'لم يكن الأمر كما بدا', used: false },
  { id: '34', type: 'twist', text: 'ظهر شخص من الماضي', used: false },
  { id: '35', type: 'twist', text: 'اكتشف أن كل شيء حلم', used: false },
  { id: '36', type: 'twist', text: 'وجد نفسه في مكان آخر', used: false }
];

// Questions modal data
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
      "ما هو طعامك المفضل ولماذا؟",
      "هل تفضل الصباح أم المساء؟",
      "ما هي أغرب تجربة مررت بها؟",
      "ما هو المكان الذي تشعر فيه بالراحة دائماً؟"
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
      "ما هو آخر نشاط جديد جربته؟",
      "هل تفضل القراءة أم مشاهدة الأفلام؟",
      "ما هو نوع الرياضة الذي تستمتع به أكثر؟"
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
      "ما هو الموقف الذي غيّر نظرتك للحياة؟",
      "ما هي الصفة التي تعتز بها في نفسك؟"
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
      "ما هو أكثر شيء يهمك في العلاقة؟",
      "كيف تتعامل مع الخلافات؟"
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
      "ما هو الهدف الذي تعمل عليه حالياً؟",
      "ما هو أكثر شيء تخاف أن تندم عليه؟"
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
      "ما هو الشيء الذي تعتقد أنه لا يمكن شرحه بالكلمات؟",
      "ما هو أكثر سؤال فلسفي يشغل بالك؟"
    ],
  }
];

const depthLabels = {
  shallow: "سطحية/خفيفة",
  medium: "متوسطة العمق",
  deep: "عميقة/فلسفية",
} as const;

const depthOrder: Array<keyof typeof depthLabels> = ["shallow", "medium", "deep"];

const games: Game[] = [
  {
    id: "questions-modal",
    name: "Discussion Questions",
    nameAr: "أسئلة للنقاش",
    description: "Interactive questions for group discussion",
    descriptionAr: "أسئلة تفاعلية للنقاش الجماعي",
    icon: <Sparkles className="w-6 h-6" />,
    color: "from-purple-500 to-pink-500"
  },
  {
    id: "two-truths-lie",
    name: "Two Truths and a Lie",
    nameAr: "حقيقتان وكذبة",
    description: "Guess which statement is false",
    descriptionAr: "خمنوا أي من العبارات كاذبة",
    icon: <Target className="w-6 h-6" />,
    color: "from-blue-500 to-cyan-500"
  },
  {
    id: "would-you-rather",
    name: "Would You Rather",
    nameAr: "ماذا تفضل",
    description: "Choose between difficult options",
    descriptionAr: "اختاروا بين خيارات صعبة",
    icon: <Heart className="w-6 h-6" />,
    color: "from-red-500 to-orange-500"
  },
  {
    id: "story-building",
    name: "Story Building",
    nameAr: "بناء القصة",
    description: "Create a story together with building blocks",
    descriptionAr: "اصنعوا قصة معاً باستخدام مكونات القصة",
    icon: <MessageSquare className="w-6 h-6" />,
    color: "from-indigo-500 to-purple-500"
  }
];


const wouldYouRatherQuestions = [
  {
    optionA: "القدرة على الطيران",
    optionB: "القدرة على قراءة الأفكار"
  },
  {
    optionA: "العيش في الماضي",
    optionB: "العيش في المستقبل"
  },
  {
    optionA: "أن تكون مشهوراً",
    optionB: "أن تكون غنياً"
  },
  {
    optionA: "قضاء يوم في الصحراء",
    optionB: "قضاء يوم في القطب الشمالي"
  },
  {
    optionA: "فقدان حاسة البصر",
    optionB: "فقدان حاسة السمع"
  }
];


export default function GroupsPage() {
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [gamePhase, setGamePhase] = useState<"intro" | "playing" | "completed">("intro");
  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState(0);
  
  // Questions modal states
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<null | typeof promptTopics[0]>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  // Story building states
  const [availableBlocks, setAvailableBlocks] = useState<StoryBlock[]>(storyBlocks);
  const [storyParts, setStoryParts] = useState<string[]>(["كان يا ما كان، في قديم الزمان..."]);
  const [selectedBlockType, setSelectedBlockType] = useState<StoryBlock['type'] | null>(null);

  const currentGame = games[currentGameIndex];

  const startSession = () => {
    setGameStarted(true);
    startCurrentGame();
  };

  const startCurrentGame = () => {
    setGamePhase("playing");
    setCurrentPromptIndex(0);
  };

  const nextGame = () => {
    if (currentGameIndex < games.length - 1) {
      setCurrentGameIndex(prev => prev + 1);
      setGamePhase("intro");
    } else {
      // All games completed
      setGamePhase("completed");
    }
  };

  const addParticipant = () => {
    if (newParticipant.trim() && !participants.includes(newParticipant.trim())) {
      setParticipants(prev => [...prev, newParticipant.trim()]);
      setNewParticipant("");
    }
  };

  const removeParticipant = (index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
  };

  const nextPrompt = () => {
    if (currentGame.id === "would-you-rather") {
      setCurrentPromptIndex(prev => (prev + 1) % wouldYouRatherQuestions.length);
    }
  };
  
  const addStoryBlock = (block: StoryBlock) => {
    setStoryParts(prev => [...prev, block.text]);
    setAvailableBlocks(prev => 
      prev.map(b => b.id === block.id ? { ...b, used: true } : b)
    );
  };
  
  const resetStory = () => {
    setStoryParts(["كان يا ما كان، في قديم الزمان..."]);
    setAvailableBlocks(storyBlocks.map(block => ({ ...block, used: false })));
  };
  
  const getBlocksByType = (type: StoryBlock['type']) => {
    return availableBlocks.filter(block => block.type === type && !block.used);
  };

  const renderGameContent = () => {
    if (gamePhase === "intro") {
      return (
        <div className="text-center space-y-6">
          <div className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-r ${currentGame.color} flex items-center justify-center text-white`}>
            {currentGame.icon}
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">{currentGame.nameAr}</h2>
            <p className="text-slate-300 text-lg">{currentGame.descriptionAr}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-slate-300">لعبة تفاعلية للمجموعة</p>
          </div>
          <Button 
            onClick={startCurrentGame}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-8 py-3 text-lg"
          >
            <Play className="w-5 h-5 mr-2" />
            ابدأ اللعبة
          </Button>
        </div>
      );
    }

    if (gamePhase === "completed") {
      return (
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center text-white">
            <Trophy className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">انتهت اللعبة!</h2>
            <p className="text-slate-300 text-lg">أحسنتم! وقت للعبة التالية</p>
          </div>
          {currentGameIndex < games.length - 1 ? (
            <Button 
              onClick={nextGame}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-8 py-3 text-lg"
            >
              <ChevronRight className="w-5 h-5 mr-2" />
              اللعبة التالية
            </Button>
          ) : (
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-white">🎉 انتهت جميع الألعاب! 🎉</h3>
              <p className="text-slate-300">شكراً لكم على المشاركة الرائعة!</p>
            </div>
          )}
        </div>
      );
    }

    // Playing phase
    return (
      <div className="space-y-6">

        {currentGame.id === "questions-modal" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-4">
                أسئلة للنقاش الجماعي
              </h3>
              <p className="text-slate-300 mb-6">
                اختاروا موضوعاً وناقشوا الأسئلة بالدور
              </p>
              <Button 
                onClick={() => setShowQuestionsModal(true)}
                className="bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-800 hover:to-blue-800 text-white px-6 py-3 rounded-2xl shadow-lg font-bold text-lg transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 border-2 border-cyan-400/30"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                فتح الأسئلة
              </Button>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "two-truths-lie" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-4">
                حقيقتان وكذبة
              </h3>
              <div className="space-y-4 text-slate-300">
                <p>قل ثلاث عبارات عن نفسك:</p>
                <ul className="list-disc list-inside space-y-2">
                  <li>حقيقة أولى</li>
                  <li>حقيقة ثانية</li>
                  <li>كذبة واحدة</li>
                </ul>
                <p className="text-sm">على الآخرين تخمين أي عبارة كاذبة!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "would-you-rather" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-6">ماذا تفضل؟</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
                  <p className="text-white font-semibold">
                    {wouldYouRatherQuestions[currentPromptIndex]?.optionA}
                  </p>
                </div>
                <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-white font-semibold">
                    {wouldYouRatherQuestions[currentPromptIndex]?.optionB}
                  </p>
                </div>
              </div>
              <Button onClick={nextPrompt} className="bg-red-600 hover:bg-red-700">
                <ChevronRight className="w-4 h-4 mr-2" />
                السؤال التالي
              </Button>
            </CardContent>
          </Card>
        )}


        {currentGame.id === "story-building" && (
          <div className="space-y-6">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-6">
                <h3 className="text-2xl font-bold text-white mb-4 text-center">بناء القصة</h3>
                <p className="text-slate-300 mb-4 text-center">
                  اختر مكوناً لإضافته للقصة!
                </p>
                
                {/* Story Display */}
                <div className="bg-slate-700/50 rounded-lg p-4 mb-6 min-h-[120px] max-h-[200px] overflow-y-auto">
                  <div className="text-slate-200 text-lg leading-relaxed">
                    {storyParts.map((part, index) => (
                      <span key={index} className={index === 0 ? "font-bold" : ""}>
                        {part}
                        {index < storyParts.length - 1 && " "}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Block Type Selector */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                  {(['character', 'setting', 'object', 'action', 'emotion', 'twist'] as const).map(type => {
                    const availableCount = getBlocksByType(type).length;
                    return (
                      <Button
                        key={type}
                        onClick={() => setSelectedBlockType(selectedBlockType === type ? null : type)}
                        disabled={availableCount === 0}
                        className={`p-3 text-sm ${
                          selectedBlockType === type 
                            ? 'bg-indigo-600 hover:bg-indigo-700' 
                            : 'bg-slate-700 hover:bg-slate-600'
                        } ${availableCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="text-center">
                          <div className="font-semibold">
                            {type === 'character' && 'شخصيات'}
                            {type === 'setting' && 'أماكن'}
                            {type === 'object' && 'أشياء'}
                            {type === 'action' && 'أحداث'}
                            {type === 'emotion' && 'مشاعر'}
                            {type === 'twist' && 'تطورات'}
                          </div>
                          <div className="text-xs opacity-75">({availableCount})</div>
                        </div>
                      </Button>
                    );
                  })}
                </div>
                
                {/* Available Blocks */}
                {selectedBlockType && (
                  <div className="space-y-3">
                    <h4 className="text-lg font-semibold text-white text-center">
                      اختر من 
                      {selectedBlockType === 'character' && 'الشخصيات'}
                      {selectedBlockType === 'setting' && 'الأماكن'}
                      {selectedBlockType === 'object' && 'الأشياء'}
                      {selectedBlockType === 'action' && 'الأحداث'}
                      {selectedBlockType === 'emotion' && 'المشاعر'}
                      {selectedBlockType === 'twist' && 'التطورات'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                      {getBlocksByType(selectedBlockType).map(block => (
                        <Button
                          key={block.id}
                          onClick={() => addStoryBlock(block)}
                          className="bg-slate-600 hover:bg-slate-500 text-white p-3 text-sm rounded-lg transition-all duration-200 hover:scale-105"
                        >
                          {block.text}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Control Buttons */}
                <div className="flex justify-center gap-4 mt-6">
                  <Button 
                    onClick={resetStory}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    إعادة تشغيل القصة
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  };

  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4" dir="rtl">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">ألعاب جماعية</h1>
            <p className="text-slate-300 text-lg">شخص واحد يستخدم الهاتف ويقود الألعاب</p>
          </div>

          {/* Games Overview */}
          <Card className="bg-slate-800/50 border-slate-700 max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-center">
                <Sparkles className="w-5 h-5 mr-2" />
                الألعاب المتاحة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3">
                {games.map((game, index) => (
                  <div key={game.id} className="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${game.color} flex items-center justify-center text-white`}>
                      {game.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">{game.nameAr}</h3>
                      <p className="text-slate-400 text-sm">لعبة تفاعلية</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="text-center mt-8">
            <Button 
              onClick={startSession}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-8 py-4 text-xl"
            >
              <Play className="w-6 h-6 mr-2" />
              ابدأ الألعاب
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4" dir="rtl">
      <div className="max-w-4xl mx-auto">
        {/* Header with game progress */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-xl font-bold text-cyan-400">{currentGame.nameAr}</div>
              <div className="text-slate-400 text-sm">اللعبة الحالية</div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={nextGame}
                variant="outline"
                size="sm"
              >
                <ChevronRight className="w-4 h-4 mr-1" />
                اللعبة التالية
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
              <span>اللعبة {currentGameIndex + 1} من {games.length}</span>
              <span>ألعاب جماعية تفاعلية</span>
            </div>
            <Progress 
              value={((currentGameIndex) / games.length) * 100} 
              className="h-2"
            />
          </div>
        </div>

        {/* Game Content */}
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="p-8">
            {renderGameContent()}
          </CardContent>
        </Card>

        {/* Instructions bar */}
        <div className="mt-6 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="text-center">
            <p className="text-slate-300">
              <Users className="w-4 h-4 inline mr-2" />
              شخص واحد يقود اللعبة ويقرأ الأسئلة للمجموعة
            </p>
          </div>
        </div>
      </div>
      
      {/* Questions Modal */}
      <Dialog open={showQuestionsModal} onOpenChange={(v) => { if (!v) { setShowQuestionsModal(false); setSelectedTopic(null); } }}>
        <DialogContent
          className="max-w-xl w-[95vw] rounded-xl p-0 overflow-hidden border border-slate-700 fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-slate-900 text-white"
          dir="rtl"
          aria-label="أسئلة للنقاش"
        >
          <DialogHeader className="flex flex-row items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-2 border-b border-slate-700 z-10 bg-slate-900 sticky top-0">
            <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-cyan-500" />
              أسئلة للنقاش
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => { setShowQuestionsModal(false); setSelectedTopic(null); }} className="rounded-full" aria-label="إغلاق الأسئلة">
              <X className="w-5 h-5" />
            </Button>
          </DialogHeader>
          
          {/* Depth Stepper */}
          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 pt-3 pb-2 z-10 relative">
            {depthOrder.map((depth, idx) => (
              <div key={depth} className="flex-1 flex flex-col items-center">
                <div
                  className={`w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-full border transition-all duration-300 ${
                    selectedTopic && selectedTopic.depth === depth
                      ? `bg-slate-800 border-cyan-400 scale-110` :
                    !selectedTopic && idx === 0
                      ? `bg-slate-800 border-cyan-400 scale-110` :
                      "bg-slate-800 border-slate-700"
                  }`}
                  aria-label={depthLabels[depth]}
                >
                  <Sparkles className={`w-5 h-5 sm:w-4 sm:h-4 ${depth === "shallow" ? "text-cyan-400" : depth === "medium" ? "text-green-400" : "text-purple-400"}`} />
                </div>
                <span className={`mt-1 text-[11px] sm:text-xs font-medium ${selectedTopic && selectedTopic.depth === depth ? "text-cyan-500" : "text-slate-400"}`}>{depthLabels[depth]}</span>
              </div>
            ))}
          </div>
          
          <div className="p-3 sm:p-6 pt-2 min-h-[300px] sm:min-h-[350px] max-h-[65vh] overflow-y-auto z-10 relative" tabIndex={0}>
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
                                ? "bg-slate-900 border-slate-700 text-cyan-300"
                                : depth === "medium"
                                ? "bg-slate-900 border-slate-700 text-green-300"
                                : "bg-slate-900 border-slate-700 text-purple-300"
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
                <div className="flex items-center gap-2 bg-slate-900 border-b border-slate-700 shadow-lg py-2 mb-2">
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
                        className="flex items-center gap-2 p-2 sm:p-3 rounded border bg-slate-800 border-slate-700 shadow-sm transition-all duration-200 group"
                        tabIndex={0}
                        aria-label={`سؤال ${i + 1}: ${q}`}
                      >
                        <span className="font-bold text-sm sm:text-base text-slate-400 w-6 text-center">{i + 1}.</span>
                        <span className="flex-1 text-sm sm:text-base">{q}</span>
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
      </Dialog>
    </div>
  );
}
