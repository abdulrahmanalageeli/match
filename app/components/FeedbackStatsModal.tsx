import { useMemo } from 'react';
import { X, Star, BrainCircuit, Users, Smile, Handshake, TrendingUp, BarChart, ThumbsDown, ThumbsUp, Lightbulb } from 'lucide-react';

// --- TYPE DEFINITIONS ---
interface FeedbackData { compatibility_rate: number; conversation_quality: number; personal_connection: number; would_meet_again: boolean; }
interface ParticipantMatch {
  round: number;
  participant_a: { mbti: string; age: number; survey_data?: { answers?: Record<string, any> } };
  participant_b: { mbti: string; age: number; survey_data?: { answers?: Record<string, any> } };
  compatibility_score: number;
  detailed_scores: { mbti: number; attachment: number; communication: number; lifestyle: number; core_values: number; vibe: number; };
  bonus_type: string;
  feedback?: { participant_a: FeedbackData | null; participant_b: FeedbackData | null; has_feedback: boolean; };
}
interface Props { matches: ParticipantMatch[]; onClose: () => void; }

// --- CONSTANTS ---
const HIGH_FEEDBACK_THRESHOLD = 80;
const LOW_FEEDBACK_THRESHOLD = 50;
const QUESTION_MAP: Record<string, string> = {
  lifestyle_1: "وقت الذروة (صباح/مساء)",
  lifestyle_2: "معدل التواصل المفضل",
  lifestyle_3: "الحاجة للمساحة الشخصية",
  lifestyle_4: "تخطيط أم عفوية؟",
  lifestyle_5: "نشاط نهاية الأسبوع",
  core_values_1: "الصدق أم الولاء؟",
  core_values_2: "الطموح أم الاستقرار؟",
  core_values_3: "التقبل أم التشابه؟",
  core_values_4: "الاعتماد أم الاستقلال؟",
  core_values_5: "الواجب أم الحرية؟",
};
const ANSWER_MAP: Record<string, Record<string, string>> = {
  lifestyle_4: { 'أ': 'Planner', 'ب': 'Balanced', 'ج': 'Spontaneous' },
  core_values_2: { 'أ': 'Ambitious', 'ب': 'Balanced', 'ج': 'Stable' },
};

// --- HELPER FUNCTIONS ---
const calculateGroupStats = (group: ParticipantMatch[]) => {
  if (group.length === 0) return null;
  const avgSystemScore = group.reduce((acc, m) => acc + m.compatibility_score, 0) / group.length;
  const topDetailedScore = Object.entries(group.reduce((acc, m) => {
    Object.entries(m.detailed_scores).forEach(([key, value]) => { acc[key] = (acc[key] || 0) + value; });
    return acc;
  }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1])[0];

  return {
    count: group.length,
    avgSystemScore,
    topDetailedScore: { name: topDetailedScore[0], value: topDetailedScore[1] / group.length },
  };
};

// --- MAIN COMPONENT ---
export default function FeedbackStatsModal({ matches, onClose }: Props) {
  const analysis = useMemo(() => {
    const eventMatches = matches.filter(m => m.round === 6 || m.round === 7);
    const getFeedbackScore = (m: ParticipantMatch) => {
      if (!m.feedback?.has_feedback) return null;
      const { participant_a, participant_b } = m.feedback;
      const rateA = participant_a?.compatibility_rate;
      const rateB = participant_b?.compatibility_rate;
      if (rateA != null && rateB != null) return (rateA + rateB) / 2;
      return rateA ?? rateB ?? null;
    };

    const highFeedbackMatches = eventMatches.filter(m => (getFeedbackScore(m) ?? 0) >= HIGH_FEEDBACK_THRESHOLD);
    const lowFeedbackMatches = eventMatches.filter(m => (getFeedbackScore(m) ?? 100) <= LOW_FEEDBACK_THRESHOLD);

    if (highFeedbackMatches.length === 0) return null;

    const highStats = calculateGroupStats(highFeedbackMatches);
    const lowStats = calculateGroupStats(lowFeedbackMatches);

    const answerPatterns = Object.keys(QUESTION_MAP).reduce((acc, q) => {
      const agreements: Record<string, number> = {};
      const pairings: Record<string, number> = {};
      highFeedbackMatches.forEach(m => {
        const ansA = m.participant_a.survey_data?.answers?.[q];
        const ansB = m.participant_b.survey_data?.answers?.[q];
        if (!ansA || !ansB) return;
        if (ansA === ansB) {
          agreements[ansA] = (agreements[ansA] || 0) + 1;
        } else {
          const pair = [ansA, ansB].sort().join('-');
          pairings[pair] = (pairings[pair] || 0) + 1;
        }
      });
      const topAgreement = Object.entries(agreements).sort((a, b) => b[1] - a[1])[0];
      const topPairing = Object.entries(pairings).sort((a, b) => b[1] - a[1])[0];
      acc[q] = { topAgreement, topPairing };
      return acc;
    }, {} as Record<string, any>);

    const recommendations: string[] = [];
    if (highStats && lowStats && highStats.topDetailedScore.name === lowStats.topDetailedScore.name) {
      recommendations.push(`'${highStats.topDetailedScore.name}' score is the most important factor in BOTH high and low feedback matches. Refining its calculation is critical.`);
    } else if (highStats) {
      recommendations.push(`'${highStats.topDetailedScore.name}' score is the strongest predictor of high feedback. Consider increasing its weight.`);
    }
    const topAgreement = Object.entries(answerPatterns).find(([q, data]) => data.topAgreement && (data.topAgreement[1] / highFeedbackMatches.length) > 0.6)?.[0];
    if (topAgreement) {
      recommendations.push(`Agreement on '${QUESTION_MAP[topAgreement]}' is extremely high in successful matches. This is a critical question.`);
    }

    return { highStats, lowStats, answerPatterns, recommendations };
  }, [matches]);

  // --- RENDER ---
  if (!analysis) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div dir="rtl" className="bg-slate-900 border-2 border-cyan-500/30 rounded-2xl p-6 w-full max-w-lg text-center">
          <h2 className="text-2xl font-bold text-yellow-300 mb-4">لا توجد بيانات كافية للتحليل</h2>
          <p className="text-slate-300\">لم يتم العثور على مطابقات بتقييمات عالية في الفعاليات 6 و 7.</p>
        </div>
      </div>
    );
  }

  const { highStats, lowStats, answerPatterns, recommendations } = analysis;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-slate-900 border-2 border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 left-4 text-slate-400 hover:text-white transition z-10"><X size={24} /></button>
        <div className="flex items-center gap-3 mb-6">
          <BarChart className="w-8 h-8 text-cyan-300" />
          <h2 className="text-3xl font-bold text-cyan-300\">تحليل معمق لتقييمات الفعاليات (6 و 7)</h2>
        </div>

        {/* Recommendations */}
        <div className="bg-slate-800/50 border border-cyan-400/30 p-4 rounded-lg mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Lightbulb className="text-cyan-300" />
            <h3 className="text-lg font-bold text-cyan-200\">توصيات لتحسين الخوارزمية</h3>
          </div>
          <ul className="space-y-2 text-sm text-slate-300 list-disc pr-5">
            {recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
          </ul>
        </div>

        {/* Comparative Analysis */}
        <div className="mb-6">
            <h3 className="text-xl font-bold text-purple-300 mb-3 text-center\">مقارنة بين التقييمات العالية والمنخفضة</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-lg">
                    <h4 className="font-bold text-lg text-green-300 flex items-center gap-2"><ThumbsUp/> تقييمات عالية ({highStats?.count})</h4>
                    <p className="text-sm text-slate-400 mt-2\">متوسط توافق النظام: <span className="font-bold text-white\">{highStats?.avgSystemScore.toFixed(1)}%</span></p>
                    <p className="text-sm text-slate-400\">أهم عامل: <span className="font-bold text-white\">{highStats?.topDetailedScore.name}</span></p>
                </div>
                <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-lg">
                    <h4 className="font-bold text-lg text-red-300 flex items-center gap-2\"><ThumbsDown/> تقييمات منخفضة ({lowStats?.count || 0})</h4>
                    <p className="text-sm text-slate-400 mt-2\">متوسط توافق النظام: <span className="font-bold text-white\">{lowStats ? lowStats.avgSystemScore.toFixed(1) : 'N/A'}%</span></p>
                    <p className="text-sm text-slate-400\">أهم عامل: <span className="font-bold text-white\">{lowStats ? lowStats.topDetailedScore.name : 'N/A'}</span></p>
                </div>
            </div>
        </div>

        {/* Answer Pattern Analysis */}
        <div className="bg-slate-800/50 p-4 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <Handshake className="text-green-400" />
            <h3 className="text-lg font-bold text-green-300\">أنماط الإجابات في المطابقات الناجحة</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(answerPatterns).map(([q, data]) => (
              <div key={q} className="text-xs text-slate-300 bg-slate-900/50 p-3 rounded-md">
                <p className="font-bold text-white mb-2\">{QUESTION_MAP[q]}</p>
                {data.topAgreement && (
                  <p>الأكثر اتفاقاً على: <span className="font-bold text-cyan-300\">'{ANSWER_MAP[q]?.[data.topAgreement[0]] || data.topAgreement[0]}'</span> ({highStats ? ((data.topAgreement[1] / highStats.count) * 100).toFixed(0) : 0}%)</p>
                )}
                {data.topPairing && (
                  <p className="mt-1\">أنجح مزيج: <span className="font-bold text-purple-300\">'{ANSWER_MAP[q]?.[data.topPairing[0].split('-')[0]] || data.topPairing[0].split('-')[0]}' + '{ANSWER_MAP[q]?.[data.topPairing[0].split('-')[1]] || data.topPairing[0].split('-')[1]}'</span></p>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}