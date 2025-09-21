import React, { useState, useEffect } from "react";
import { 
  Clock, 
  Users, 
  Play, 
  Pause, 
  SkipForward, 
  ChevronRight, 
  ChevronLeft,
  Trophy,
  Star,
  Heart,
  Zap,
  Target,
  Smile,
  ThumbsUp,
  MessageSquare,
  Sparkles,
  Plus,
  Trash2,
  BookOpen,
  Lightbulb
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import PromptTopicsModal from "../components/PromptTopicsModal";

interface Game {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  duration: number; // in minutes
  icon: React.ReactNode;
  color: string;
}

const games: Game[] = [
  {
    id: "discussion-questions",
    name: "Discussion Questions",
    nameAr: "أسئلة للنقاش",
    description: "Deep conversation starters",
    descriptionAr: "أسئلة عميقة لبدء المحادثات",
    duration: 10,
    icon: <Sparkles className="w-6 h-6" />,
    color: "from-purple-500 to-pink-500"
  },
  {
    id: "two-truths-lie",
    name: "Two Truths and a Lie",
    nameAr: "حقيقتان وكذبة",
    description: "Guess which statement is false",
    descriptionAr: "خمنوا أي من العبارات كاذبة",
    duration: 8,
    icon: <Target className="w-6 h-6" />,
    color: "from-blue-500 to-cyan-500"
  },
  {
    id: "would-you-rather",
    name: "Would You Rather",
    nameAr: "ماذا تفضل",
    description: "Choose between difficult options",
    descriptionAr: "اختاروا بين خيارات صعبة",
    duration: 7,
    icon: <Heart className="w-6 h-6" />,
    color: "from-red-500 to-orange-500"
  },
  {
    id: "story-building",
    name: "Story Building",
    nameAr: "بناء القصة",
    description: "Create a story together with building blocks",
    descriptionAr: "اصنعوا قصة معاً باستخدام عناصر القصة",
    duration: 5,
    icon: <BookOpen className="w-6 h-6" />,
    color: "from-indigo-500 to-purple-500"
  }
];

// Story building elements
const storyElements = {
  characters: [
    "أمير شجاع", "أميرة ذكية", "ساحر قديم", "تاجر مسافر", "طفل فضولي",
    "عالم مجنون", "محارب قوي", "راهب حكيم", "لص ماهر", "فلاح بسيط"
  ],
  settings: [
    "في قلعة مهجورة", "في غابة سحرية", "في صحراء واسعة", "في مدينة عائمة",
    "في كهف مظلم", "في جزيرة نائية", "في قرية صغيرة", "في مختبر سري",
    "في سوق شعبي", "في جبل عالي"
  ],
  objects: [
    "خريطة كنز قديمة", "مفتاح ذهبي غامض", "كتاب سحري", "سيف لامع",
    "جرة سحرية", "بوصلة مكسورة", "رسالة مشفرة", "حجر كريم متوهج",
    "مرآة سحرية", "عصا خشبية منحوتة"
  ],
  conflicts: [
    "اختفى شيء مهم", "ظهر وحش مخيف", "حدثت عاصفة قوية", "انقطع الطريق",
    "نفد الطعام والماء", "ضاع الطريق", "كسر شيء ثمين", "ظهر عدو قديم",
    "حدث سوء فهم", "اكتشف سر خطير"
  ]
};

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
  const [gameTimer, setGameTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [gamePhase, setGamePhase] = useState<"intro" | "playing" | "completed">("intro");
  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [showPromptTopicsModal, setShowPromptTopicsModal] = useState(false);
  const [storyParts, setStoryParts] = useState<string[]>([]);
  const [currentStoryElement, setCurrentStoryElement] = useState<{type: string, value: string} | null>(null);

  const currentGame = games[currentGameIndex];


  // Game timer effect
  useEffect(() => {
    if (gamePhase === "playing" && !isPaused && gameTimer > 0) {
      const interval = setInterval(() => {
        setGameTimer(prev => {
          if (prev <= 1) {
            setGamePhase("completed");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gamePhase, isPaused, gameTimer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startSession = () => {
    if (participants.length < 2) {
      alert("يجب إضافة مشاركين على الأقل لبدء الجلسة");
      return;
    }
    setGameStarted(true);
    startCurrentGame();
  };

  const getRandomStoryElement = () => {
    const types = Object.keys(storyElements);
    const randomType = types[Math.floor(Math.random() * types.length)];
    const elements = storyElements[randomType as keyof typeof storyElements];
    const randomElement = elements[Math.floor(Math.random() * elements.length)];
    return { type: randomType, value: randomElement };
  };

  const addStoryPart = (part: string) => {
    setStoryParts(prev => [...prev, part]);
    setCurrentPlayer(prev => (prev + 1) % participants.length);
    setCurrentStoryElement(getRandomStoryElement());
  };

  const startCurrentGame = () => {
    setGameTimer(currentGame.duration * 60);
    setGamePhase("playing");
    setCurrentPromptIndex(0);
    setCurrentPlayer(0);
    if (currentGame.id === "story-building") {
      setStoryParts([]);
      setCurrentStoryElement(getRandomStoryElement());
    }
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
    setCurrentPlayer(prev => (prev + 1) % participants.length);
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
            <p className="text-slate-300">مدة اللعبة: {currentGame.duration} دقائق</p>
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
        <div className="text-center">
          <div className="flex items-center justify-center space-x-4 mb-4">
            <Badge variant="secondary" className="text-lg px-4 py-2">
              {participants[currentPlayer] || "اللاعب الحالي"}
            </Badge>
          </div>
        </div>

        {currentGame.id === "discussion-questions" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-4">
                أسئلة للنقاش العميق
              </h3>
              <p className="text-slate-300 mb-6">
                اختر موضوعاً وليجب كل مشارك على السؤال بالدور
              </p>
              <p className="text-slate-400 mb-4">
                دور: {participants[currentPlayer] || "اللاعب الحالي"}
              </p>
              <Button 
                onClick={() => setShowPromptTopicsModal(true)}
                className="bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-800 hover:to-blue-800 text-white px-6 py-3 rounded-2xl shadow-lg font-bold text-lg transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 border-2 border-cyan-400/30"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                اختر أسئلة للنقاش
              </Button>
              <div className="mt-4">
                <Button 
                  onClick={() => setCurrentPlayer(prev => (prev + 1) % participants.length)} 
                  className="bg-purple-600 hover:bg-purple-700 mr-2"
                >
                  <ChevronRight className="w-4 h-4 mr-2" />
                  اللاعب التالي
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "two-truths-lie" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-4">
                دور {participants[currentPlayer] || "اللاعب"}
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
              <Button 
                onClick={() => setCurrentPlayer(prev => (prev + 1) % participants.length)} 
                className="mt-4 bg-blue-600 hover:bg-blue-700"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                اللاعب التالي
              </Button>
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
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6">
              <h3 className="text-2xl font-bold text-white mb-4 text-center">بناء القصة</h3>
              
              {/* Current Story */}
              <div className="bg-slate-700/50 rounded-lg p-4 mb-6 min-h-[150px] max-h-[300px] overflow-y-auto">
                <h4 className="text-lg font-semibold text-cyan-400 mb-3">القصة حتى الآن:</h4>
                {storyParts.length === 0 ? (
                  <p className="text-slate-400 italic">ابدأ القصة بإضافة الجملة الأولى...</p>
                ) : (
                  <div className="space-y-2">
                    {storyParts.map((part, index) => (
                      <p key={index} className="text-slate-300">
                        <span className="text-cyan-400 font-semibold">{index + 1}.</span> {part}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Current Player and Story Element */}
              <div className="text-center mb-6">
                <div className="bg-slate-800/70 rounded-lg p-4 mb-4">
                  <p className="text-white font-semibold mb-2">
                    دور: {participants[currentPlayer] || "اللاعب"}
                  </p>
                  {currentStoryElement && (
                    <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-lg p-3 border border-indigo-400/30">
                      <p className="text-indigo-300 text-sm mb-1">استخدم هذا العنصر في جملتك:</p>
                      <p className="text-white font-bold">{currentStoryElement.value}</p>
                      <p className="text-slate-400 text-xs mt-1">({currentStoryElement.type === 'characters' ? 'شخصية' : currentStoryElement.type === 'settings' ? 'مكان' : currentStoryElement.type === 'objects' ? 'شيء' : 'مشكلة'})</p>
                    </div>
                  )}
                </div>
                
                {/* Story Input */}
                <div className="space-y-4">
                  <textarea
                    placeholder="أضف جملة أو جملتين للقصة..."
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 resize-none"
                    rows={3}
                    id="story-input"
                  />
                  <div className="flex justify-center space-x-3">
                    <Button 
                      onClick={() => {
                        const input = document.getElementById('story-input') as HTMLTextAreaElement;
                        if (input.value.trim()) {
                          addStoryPart(input.value.trim());
                          input.value = '';
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      إضافة للقصة
                    </Button>
                    <Button 
                      onClick={() => setCurrentStoryElement(getRandomStoryElement())}
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      <Lightbulb className="w-4 h-4 mr-2" />
                      عنصر جديد
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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
            <p className="text-slate-300 text-lg">30 دقيقة من المرح والتفاعل</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Participants Section */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  المشاركون ({participants.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newParticipant}
                    onChange={(e) => setNewParticipant(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addParticipant()}
                    placeholder="اسم المشارك"
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
                  />
                  <Button onClick={addParticipant} size="sm">
                    إضافة
                  </Button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {participants.map((participant, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
                      <span className="text-white">{participant}</span>
                      <Button 
                        onClick={() => removeParticipant(index)}
                        size="sm" 
                        variant="destructive"
                      >
                        حذف
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Games Overview */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Sparkles className="w-5 h-5 mr-2" />
                  الألعاب المتاحة
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {games.map((game, index) => (
                  <div key={game.id} className="flex items-center space-x-3 p-3 bg-slate-700/30 rounded-lg">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${game.color} flex items-center justify-center text-white`}>
                      {game.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">{game.nameAr}</h3>
                      <p className="text-slate-400 text-sm">{game.duration} دقائق</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-8">
            <Button 
              onClick={startSession}
              disabled={participants.length < 2}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-8 py-4 text-xl"
            >
              <Play className="w-6 h-6 mr-2" />
              ابدأ الجلسة
            </Button>
            {participants.length < 2 && (
              <p className="text-slate-400 mt-2">يجب إضافة مشاركين على الأقل</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4" dir="rtl">
      <div className="max-w-4xl mx-auto">
        {/* Header with game info */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-xl font-bold text-cyan-400">{formatTime(gameTimer)}</div>
                <div className="text-slate-400 text-sm">وقت اللعبة</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => setIsPaused(!isPaused)}
                variant="outline"
                size="sm"
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>
              <Button
                onClick={nextGame}
                variant="outline"
                size="sm"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
              <span>اللعبة {currentGameIndex + 1} من {games.length}</span>
              <span>{currentGame.nameAr}</span>
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

        {/* Participants bar */}
        <div className="mt-6 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">المشاركون:</span>
            <div className="flex flex-wrap gap-2">
              {participants.map((participant, index) => (
                <Badge 
                  key={index} 
                  variant={index === currentPlayer ? "default" : "secondary"}
                  className={index === currentPlayer ? "bg-cyan-500" : ""}
                >
                  {participant}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Prompts/Questions Modal */}
      <PromptTopicsModal 
        open={showPromptTopicsModal} 
        onClose={() => setShowPromptTopicsModal(false)} 
        dark={true} 
      />
    </div>
  );
}
