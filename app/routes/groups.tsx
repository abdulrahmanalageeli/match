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
import logoPng from "../welcome/blindmatch.png";

// Logo Component for Groups Page
const GroupsLogoHeader = () => (
  <div className="fixed top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 z-50">
    <div 
      onClick={() => window.location.href = "/"}
      className="group cursor-pointer transition-all duration-700 ease-out hover:scale-105"
    >
      <div className="relative">
        {/* Glow effect background */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-cyan-500/20 rounded-lg sm:rounded-xl md:rounded-2xl blur-sm sm:blur-md md:blur-xl opacity-60 group-hover:opacity-80 transition-opacity duration-1000 ease-in-out"></div>
        
        {/* Main logo container */}
        <div className="relative bg-gradient-to-br from-slate-800/90 via-slate-700/90 to-slate-800/90 backdrop-blur-xl border border-white/10 rounded-lg sm:rounded-xl md:rounded-2xl p-2 sm:p-2.5 md:p-3 shadow-lg sm:shadow-xl md:shadow-2xl group-hover:shadow-purple-500/20 transition-all duration-700 ease-out">
          <img 
            src={logoPng} 
            alt="BlindMatch" 
            className="w-12 h-12 xs:w-14 xs:h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 object-contain drop-shadow-sm sm:drop-shadow-md md:drop-shadow-lg" 
          />
        </div>
        
        {/* Subtle animated border */}
        <div className="absolute inset-0 rounded-lg sm:rounded-xl md:rounded-2xl bg-gradient-to-r from-purple-500/30 via-blue-500/30 to-cyan-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 ease-in-out"></div>
      </div>
    </div>
  </div>
);

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
    duration: 0,
    icon: <Sparkles className="w-6 h-6" />,
    color: "from-purple-500 to-pink-500"
  },
  {
    id: "never-have-i-ever",
    name: "Never Have I Ever",
    nameAr: "لم أفعل من قبل",
    description: "Share deep personal experiences",
    descriptionAr: "شاركوا تجاربكم الشخصية العميقة",
    duration: 0,
    icon: <Target className="w-6 h-6" />,
    color: "from-blue-500 to-cyan-500"
  },
  {
    id: "would-you-rather",
    name: "Would You Rather",
    nameAr: "ماذا تفضل",
    description: "Choose between meaningful life decisions",
    descriptionAr: "اختاروا بين قرارات حياتية مهمة",
    duration: 0,
    icon: <Heart className="w-6 h-6" />,
    color: "from-red-500 to-orange-500"
  }
];


const neverHaveIEverQuestions = [
  "لم أفعل من قبل: اتخذت قراراً غير حياتي بسبب الخوف",
  "لم أفعل من قبل: قلت لشخص أحبه أني أحبه فعلاً",
  "لم أفعل من قبل: سامحت شخصاً جرحني بعمق",
  "لم أفعل من قبل: بكيت أمام شخص غريب بسبب موقف مؤثر",
  "لم أفعل من قبل: غيرت رأيي في شيء مهم بعد محادثة عميقة",
  "لم أفعل من قبل: ضحيت بشيء مهم من أجل شخص آخر",
  "لم أفعل من قبل: شعرت بالوحدة رغم وجود أشخاص حولي",
  "لم أفعل من قبل: اعتذرت عن شيء قلته في لحظة غضب",
  "لم أفعل من قبل: شعرت بالفخر الحقيقي بإنجاز حققته",
  "لم أفعل من قبل: اكتشفت شيئاً جديداً عن نفسي في موقف صعب"
];

const wouldYouRatherQuestions = [
  {
    optionA: "أن تعيش حياة مريحة ولكن بدون إنجازات كبيرة",
    optionB: "أن تحقق إنجازات عظيمة ولكن بتضحيات وصعوبات مستمرة"
  },
  {
    optionA: "أن تكون محبوباً من الجميع ولكن لا تحب نفسك",
    optionB: "أن تحب نفسك حقاً ولكن لا يحبك أحد"
  },
  {
    optionA: "أن تتذكر كل لحظة في حياتك بوضوح",
    optionB: "أن تنسى كل الذكريات المؤلمة نهائياً"
  },
  {
    optionA: "أن تعرف أفكار الجميع عنك بصدق",
    optionB: "أن لا تعرف أبداً ما يفكر فيه الآخرون عنك"
  },
  {
    optionA: "أن تموت وأنت محبوب ولكن لم تحقق أحلامك",
    optionB: "أن تموت وقد حققت أحلامك ولكن وحيداً"
  }
];


export default function GroupsPage() {
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [gamePhase, setGamePhase] = useState<"intro" | "playing" | "completed">("intro");
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [showPromptTopicsModal, setShowPromptTopicsModal] = useState(false);

  const currentGame = games[currentGameIndex];


  // Remove timer-related useEffect

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startSession = () => {
    setGameStarted(true);
  };


  const startGame = (gameId: string) => {
    setSelectedGameId(gameId);
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


  const nextPrompt = () => {
    setCurrentPromptIndex(prev => (prev + 1) % wouldYouRatherQuestions.length);
    setCurrentPlayer(prev => prev + 1);
  };

  const renderGameSelection = () => {
    return (
      <div className="text-center space-y-6">
        <h2 className="text-3xl font-bold text-white mb-6">اختر لعبة</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {games.map((game) => (
            <div key={game.id} className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 hover:border-cyan-400 transition-all cursor-pointer" onClick={() => startGame(game.id)}>
              <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r ${game.color} flex items-center justify-center text-white`}>
                {game.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{game.nameAr}</h3>
              <p className="text-slate-300 text-sm">{game.descriptionAr}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderGameContent = () => {
    if (!selectedGameId) {
      return renderGameSelection();
    }

    const currentGame = games.find(g => g.id === selectedGameId);
    if (!currentGame) return null;

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
              اللاعب رقم {currentPlayer + 1}
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
                دور: اللاعب رقم {currentPlayer + 1}
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
                  onClick={() => setCurrentPlayer(prev => prev + 1)} 
                  className="bg-purple-600 hover:bg-purple-700 mr-2"
                >
                  <ChevronRight className="w-4 h-4 mr-2" />
                  اللاعب التالي
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentGame.id === "never-have-i-ever" && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-6 text-center">
              <h3 className="text-2xl font-bold text-white mb-4">
                دور اللاعب رقم {currentPlayer + 1}
              </h3>
              <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
                <p className="text-white text-lg font-semibold">
                  {neverHaveIEverQuestions[currentPromptIndex % neverHaveIEverQuestions.length]}
                </p>
              </div>
              <div className="space-y-4 text-slate-300 text-sm">
                <p>إذا فعلت هذا الشيء، شارك تجربتك مع المجموعة</p>
                <p>إذا لم تفعله، ابق صامتاً</p>
              </div>
              <div className="flex justify-center space-x-3 mt-6">
                <Button 
                  onClick={() => setCurrentPromptIndex(prev => (prev + 1) % neverHaveIEverQuestions.length)} 
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <ChevronRight className="w-4 h-4 mr-2" />
                  السؤال التالي
                </Button>
                <Button 
                  onClick={() => setCurrentPlayer(prev => prev + 1)} 
                  className="bg-purple-600 hover:bg-purple-700"
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
                دور اللاعب رقم {currentPlayer + 1}
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
                onClick={() => setCurrentPlayer(prev => prev + 1)} 
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


      </div>
    );
  };

  if (!gameStarted) {
    return (
      <>
        <GroupsLogoHeader />
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4" dir="rtl">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">ألعاب جماعية</h1>
            <p className="text-slate-300 text-lg">30 دقيقة من المرح والتفاعل</p>
          </div>

          <div className="max-w-2xl mx-auto">
            {/* Circle Order Instructions */}
            <Card className="bg-slate-800/50 border-slate-700 mb-8">
              <CardContent className="p-6 text-center">
                <h3 className="text-xl font-bold text-white mb-4">تعليمات اللعب</h3>
                <p className="text-slate-300 text-lg mb-4">اجلسوا في دائرة والعبوا بالترتيب</p>
                <p className="text-slate-400 text-sm">سيتم عرض رقم اللاعب الحالي في الأعلى</p>
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
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white px-8 py-4 text-xl"
            >
              <Play className="w-6 h-6 mr-2" />
              ابدأ الجلسة
            </Button>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <>
      <GroupsLogoHeader />
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4" dir="rtl">
      <div className="max-w-4xl mx-auto">
        {/* Header with game info */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-xl font-bold text-cyan-400">{selectedGameId ? games.find(g => g.id === selectedGameId)?.nameAr : 'اختر لعبة'}</div>
                <div className="text-slate-400 text-sm">اللعبة الحالية</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => {
                  setSelectedGameId(null);
                  setGamePhase('intro');
                }}
                variant="outline"
                size="sm"
              >
                <ChevronLeft className="w-4 h-4" />
                عودة
              </Button>
            </div>
          </div>
        </div>

        {/* Game Content */}
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="p-8">
            {renderGameContent()}
          </CardContent>
        </Card>

        {/* Current Player Display */}
        <div className="mt-6 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">اللاعب الحالي:</span>
              <Badge className="bg-cyan-500 text-white text-lg px-4 py-2">
                رقم {currentPlayer + 1}
              </Badge>
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
    </>
  );
}
