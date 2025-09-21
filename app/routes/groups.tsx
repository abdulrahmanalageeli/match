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
  Sparkles
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";

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
    id: "never-have-i-ever",
    name: "Never Have I Ever",
    nameAr: "لم أفعل من قبل",
    description: "Share experiences you've never had",
    descriptionAr: "شاركوا التجارب التي لم تخوضوها من قبل",
    duration: 8,
    icon: <Star className="w-6 h-6" />,
    color: "from-purple-500 to-pink-500"
  },
  {
    id: "two-truths-lie",
    name: "Two Truths and a Lie",
    nameAr: "حقيقتان وكذبة",
    description: "Guess which statement is false",
    descriptionAr: "خمنوا أي من العبارات كاذبة",
    duration: 7,
    icon: <Target className="w-6 h-6" />,
    color: "from-blue-500 to-cyan-500"
  },
  {
    id: "would-you-rather",
    name: "Would You Rather",
    nameAr: "ماذا تفضل",
    description: "Choose between difficult options",
    descriptionAr: "اختاروا بين خيارات صعبة",
    duration: 6,
    icon: <Heart className="w-6 h-6" />,
    color: "from-red-500 to-orange-500"
  },
  {
    id: "quick-fire",
    name: "Quick Fire Questions",
    nameAr: "أسئلة سريعة",
    description: "Rapid-fire fun questions",
    descriptionAr: "أسئلة ممتعة وسريعة",
    duration: 5,
    icon: <Zap className="w-6 h-6" />,
    color: "from-green-500 to-emerald-500"
  },
  {
    id: "story-building",
    name: "Story Building",
    nameAr: "بناء القصة",
    description: "Create a story together",
    descriptionAr: "اصنعوا قصة معاً",
    duration: 4,
    icon: <MessageSquare className="w-6 h-6" />,
    color: "from-indigo-500 to-purple-500"
  }
];

const neverHaveIEverPrompts = [
  "لم أسافر خارج البلد من قبل",
  "لم أتعلم العزف على آلة موسيقية من قبل",
  "لم أقفز بالمظلة من قبل",
  "لم أطبخ وجبة كاملة بنفسي من قبل",
  "لم أشاهد فيلم رعب وحدي من قبل",
  "لم أنم في خيمة من قبل",
  "لم أركب الخيل من قبل",
  "لم أتعلم لغة أجنبية من قبل",
  "لم أشارك في مسابقة من قبل",
  "لم أكتب رسالة بخط اليد من قبل"
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

const quickFireQuestions = [
  "ما هو لونك المفضل؟",
  "أي فصل من السنة تحب أكثر؟",
  "قهوة أم شاي؟",
  "كتاب أم فيلم؟",
  "بحر أم جبال؟",
  "حيوان أليف مفضل؟",
  "طعام لا يمكنك العيش بدونه؟",
  "هواية تتمنى تعلمها؟",
  "مكان تحلم بزيارته؟",
  "شخصية تاريخية تود لقاءها؟"
];

export default function GroupsPage() {
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [sessionTimer, setSessionTimer] = useState(30 * 60); // 30 minutes in seconds
  const [gameTimer, setGameTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [gamePhase, setGamePhase] = useState<"intro" | "playing" | "completed">("intro");
  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState("");
  const [currentPlayer, setCurrentPlayer] = useState(0);

  const currentGame = games[currentGameIndex];

  // Session timer effect
  useEffect(() => {
    if (gameStarted && !isPaused && sessionTimer > 0) {
      const interval = setInterval(() => {
        setSessionTimer(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameStarted, isPaused, sessionTimer]);

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

  const startCurrentGame = () => {
    setGameTimer(currentGame.duration * 60);
    setGamePhase("playing");
    setCurrentPromptIndex(0);
    setCurrentPlayer(0);
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
    if (currentGame.id === "never-have-i-ever") {
      setCurrentPromptIndex(prev => (prev + 1) % neverHaveIEverPrompts.length);
    } else if (currentGame.id === "would-you-rather") {
      setCurrentPromptIndex(prev => (prev + 1) % wouldYouRatherQuestions.length);
    } else if (currentGame.id === "quick-fire") {
      setCurrentPromptIndex(prev => (prev + 1) % quickFireQuestions.length);
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

        {currentGame.id === "never-have-i-ever" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-4">
                {neverHaveIEverPrompts[currentPromptIndex]}
              </h3>
              <p className="text-slate-300 mb-6">
                إذا لم تفعل هذا من قبل، ارفع يدك!
              </p>
              <Button onClick={nextPrompt} className="bg-purple-600 hover:bg-purple-700">
                <ChevronRight className="w-4 h-4 mr-2" />
                السؤال التالي
              </Button>
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

        {currentGame.id === "quick-fire" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-4">
                {quickFireQuestions[currentPromptIndex]}
              </h3>
              <p className="text-slate-300 mb-6">
                إجابة سريعة من {participants[currentPlayer] || "اللاعب"}!
              </p>
              <Button onClick={nextPrompt} className="bg-green-600 hover:bg-green-700">
                <ChevronRight className="w-4 h-4 mr-2" />
                السؤال التالي
              </Button>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "story-building" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-4">بناء القصة</h3>
              <p className="text-slate-300 mb-6">
                {participants[currentPlayer] || "اللاعب"}, أضف جملة واحدة للقصة!
              </p>
              <div className="bg-slate-700/50 rounded-lg p-4 mb-6 min-h-[100px]">
                <p className="text-slate-300 italic">
                  "كان يا ما كان، في قديم الزمان..."
                </p>
              </div>
              <Button 
                onClick={() => setCurrentPlayer(prev => (prev + 1) % participants.length)} 
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <ChevronRight className="w-4 h-4 mr-2" />
                اللاعب التالي
              </Button>
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
        {/* Header with timers */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">{formatTime(sessionTimer)}</div>
                <div className="text-slate-400 text-sm">الوقت المتبقي</div>
              </div>
              <div className="w-px h-12 bg-slate-600"></div>
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
    </div>
  );
}
