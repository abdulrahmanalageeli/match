import { Clock, Users, ChevronDown, Home, Settings, HelpCircle } from "lucide-react";
import { useState } from "react";

interface EnhancedHeaderProps {
  timeRemaining: number;
  participantName?: string;
  participantNumber?: number | null;
  tableNumber?: number | null;
  groupMembers?: string[];
  currentGame?: string;
  onGoHome?: () => void;
  onShowHelp?: () => void;
}

export function EnhancedHeader({
  timeRemaining,
  participantName,
  participantNumber,
  tableNumber,
  groupMembers = [],
  currentGame,
  onGoHome,
  onShowHelp
}: EnhancedHeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeStatus = () => {
    if (timeRemaining <= 300) return { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50', pulse: true };
    if (timeRemaining <= 600) return { color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/50', pulse: false };
    return { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', pulse: false };
  };

  const timeStatus = getTimeStatus();
  const progress = ((1800 - timeRemaining) / 1800) * 100; // 30 minutes = 1800 seconds

  return (
    <div className="sticky top-0 z-40 bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 shadow-2xl">
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-700/30">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 transition-all duration-1000 ease-linear relative overflow-hidden"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* Logo */}
          <button
            onClick={onGoHome}
            className="flex-shrink-0 transition-transform duration-200 hover:scale-110 active:scale-95"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 p-1.5 shadow-lg ring-1 ring-white/10">
              <Home className="w-full h-full text-white" strokeWidth={2.5} />
            </div>
          </button>

          {/* Center info */}
          <div className="flex-1 min-w-0">
            {/* Timer */}
            <div className={`flex items-center justify-center gap-2 ${timeStatus.bg} ${timeStatus.border} border rounded-xl px-3 py-2 mb-1`}>
              <Clock className={`w-4 h-4 ${timeStatus.color} ${timeStatus.pulse ? 'animate-pulse' : ''}`} />
              <span className={`text-lg font-bold ${timeStatus.color} ${timeStatus.pulse ? 'animate-pulse' : ''} tabular-nums`}>
                {formatTime(timeRemaining)}
              </span>
            </div>

            {/* Current game or participant info */}
            {currentGame ? (
              <div className="text-center">
                <p className="text-xs text-slate-400 truncate">{currentGame}</p>
              </div>
            ) : participantName ? (
              <button
                onClick={() => setShowGroupInfo(!showGroupInfo)}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
              >
                <span className="truncate">{participantName}</span>
                {tableNumber && <span className="text-cyan-400">• طاولة {tableNumber}</span>}
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showGroupInfo ? 'rotate-180' : ''}`} />
              </button>
            ) : null}
          </div>

          {/* Menu button */}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-700/50 border border-slate-600/50 hover:bg-slate-600/50 hover:border-slate-500 flex items-center justify-center text-slate-300 hover:text-white transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Group info dropdown */}
        {showGroupInfo && groupMembers.length > 0 && (
          <div className="mt-3 p-3 rounded-xl bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-white">أعضاء المجموعة ({groupMembers.length})</span>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {groupMembers.map((member, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm text-slate-300 p-2 rounded-lg bg-slate-700/30"
                >
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"></div>
                  <span className="truncate">{member}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Menu dropdown */}
        {showMenu && (
          <div className="mt-3 p-2 rounded-xl bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 space-y-1 animate-in slide-in-from-top duration-300">
            <button
              onClick={() => {
                setShowMenu(false);
                onShowHelp?.();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 text-slate-300 hover:text-white transition-colors text-sm"
            >
              <HelpCircle className="w-4 h-4" />
              <span>المساعدة</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onGoHome?.();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 text-slate-300 hover:text-white transition-colors text-sm"
            >
              <Home className="w-4 h-4" />
              <span>العودة للرئيسية</span>
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
