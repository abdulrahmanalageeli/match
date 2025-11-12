import { useMemo } from 'react';
import { X, Lightbulb, BarChart3, Users, Star, HeartHandshake, TrendingUp, ThumbsUp, ThumbsDown, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

// --- TYPE DEFINITIONS ---
interface FeedbackData { compatibility_rate: number; conversation_quality: number; personal_connection: number; would_meet_again: boolean; }
interface ParticipantMatch {
  round: number;
  participant_a: { mbti: string; age: number; survey_data?: { answers?: Record<string, any> } };
  participant_b: { mbti: string; age: number; survey_data?: { answers?: Record<string, any> } };
  compatibility_score: number;
  detailed_scores: { mbti: number; attachment: number; communication: number; lifestyle: number; core_values: number; vibe: number; };
  feedback?: { participant_a: FeedbackData | null; participant_b: FeedbackData | null; has_feedback: boolean; };
}
interface Props { matches: ParticipantMatch[]; onClose: () => void; }

// --- HELPER & ANALYSIS LOGIC ---
const useFeedbackAnalysis = (matches: ParticipantMatch[]) => {
  return useMemo(() => {
    const feedbackMatches = matches.filter(m => m.feedback?.has_feedback);

    if (feedbackMatches.length === 0) return null;

    const getAvgFeedbackScore = (m: ParticipantMatch) => {
      const { participant_a, participant_b } = m.feedback!;
      const rates = [participant_a?.compatibility_rate, participant_b?.compatibility_rate].filter(r => r != null) as number[];
      return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    };

    const highFeedbackMatches = feedbackMatches.filter(m => getAvgFeedbackScore(m) >= 80);
    const lowFeedbackMatches = feedbackMatches.filter(m => getAvgFeedbackScore(m) <= 50);

    const totalFeedback = feedbackMatches.length;
    const avgSystemScore = feedbackMatches.reduce((acc, m) => acc + m.compatibility_score, 0) / totalFeedback;
    const avgUserRating = feedbackMatches.reduce((acc, m) => acc + getAvgFeedbackScore(m), 0) / totalFeedback;

    const mutualMeetAgain = feedbackMatches.filter(m => 
      m.feedback?.participant_a?.would_meet_again && m.feedback?.participant_b?.would_meet_again
    ).length;
    const meetAgainRate = (mutualMeetAgain / totalFeedback) * 100;

    const scoreComparisonData = [
      { name: 'Scores', 'System Score': avgSystemScore, 'User Rating': avgUserRating },
    ];

    const meetAgainData = [
      { name: 'Mutual Yes', value: mutualMeetAgain },
      { name: 'Others', value: totalFeedback - mutualMeetAgain },
    ];

    const detailedScoresAnalysis = highFeedbackMatches.reduce((acc, m) => {
      for (const [key, value] of Object.entries(m.detailed_scores)) {
        acc[key] = (acc[key] || 0) + value;
      }
      return acc;
    }, {} as Record<string, number>);

    const radarData = Object.entries(detailedScoresAnalysis).map(([subject, value]) => ({
      subject: subject.replace('_', ' ').replace(/(?:^|\s)\S/g, a => a.toUpperCase()),
      A: (value / highFeedbackMatches.length),
      fullMark: 25, // Assuming max score for each category is 25 for normalization
    }));

    const topFactor = radarData.length > 0 ? radarData.sort((a, b) => b.A - a.A)[0].subject : 'N/A';

    const recommendations = [];
    if (avgUserRating < avgSystemScore - 10) {
      recommendations.push(`System score is significantly higher than user ratings (${avgSystemScore.toFixed(1)}% vs ${avgUserRating.toFixed(1)}%). Review scoring weights.`);
    } else if (avgUserRating > avgSystemScore + 5) {
        recommendations.push(`User ratings are higher than system scores (${avgUserRating.toFixed(1)}% vs ${avgSystemScore.toFixed(1)}%). The algorithm is performing well.`);
    }
    recommendations.push(`'${topFactor}' is the strongest predictor in successful matches. Consider increasing its weight or refining its questions.`);
    if (meetAgainRate < 50) {
      recommendations.push(`Mutual 'Meet Again' rate is low (${meetAgainRate.toFixed(1)}%). Focus on improving personal connection factors.`);
    }

    return {
      totalFeedback, avgSystemScore, avgUserRating, meetAgainRate,
      scoreComparisonData, meetAgainData, radarData, recommendations,
      highFeedbackCount: highFeedbackMatches.length,
      lowFeedbackCount: lowFeedbackMatches.length,
    };
  }, [matches]);
};

// --- UI COMPONENTS ---
const StatCard = ({ icon, title, value, colorClass }: { icon: React.ReactNode, title: string, value: string, colorClass: string }) => (
  <div className={`bg-slate-800/50 border-l-4 ${colorClass} p-4 rounded-lg shadow-md flex items-center`}>
    <div className="mr-4">{icon}</div>
    <div>
      <p className="text-sm text-slate-400">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  </div>
);

const ChartContainer = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="bg-slate-800/50 p-4 rounded-lg shadow-lg h-80 flex flex-col">
    <h3 className="text-lg font-bold text-cyan-200 mb-4 text-center">{title}</h3>
    <div className="grow">{children}</div>
  </div>
);

// --- MAIN COMPONENT ---
export default function FeedbackStatsModal({ matches, onClose }: Props) {
  const analysis = useFeedbackAnalysis(matches);

  if (!analysis) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div dir="rtl" className="bg-slate-900 border-2 border-cyan-500/30 rounded-2xl p-6 w-full max-w-lg text-center">
          <h2 className="text-2xl font-bold text-yellow-300 mb-4">لا توجد بيانات كافية للتحليل</h2>
          <p className="text-slate-300">لم يتم العثور على تقييمات كافية لإنشاء تقرير إحصائي.</p>
        </div>
      </div>
    );
  }

  const { totalFeedback, avgSystemScore, avgUserRating, meetAgainRate, scoreComparisonData, meetAgainData, radarData, recommendations, highFeedbackCount, lowFeedbackCount } = analysis;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-50 p-4 font-sans" onClick={onClose}>
      <div dir="rtl" className="bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto p-6 scrollbar-hide" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 left-4 text-slate-400 hover:text-cyan-300 transition-colors z-10"><X size={28} /></button>
        <div className="flex items-center gap-4 mb-6 border-b border-slate-700 pb-4">
          <BarChart3 className="w-10 h-10 text-cyan-300" />
          <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-linear-to-r from-cyan-300 to-purple-400">تحليل أداء الخوارزمية</h2>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<Users size={32} className="text-cyan-400" />} title="إجمالي التقييمات" value={totalFeedback.toString()} colorClass="border-cyan-400" />
          <StatCard icon={<Target size={32} className="text-purple-400" />} title="متوسط توافق النظام" value={`${avgSystemScore.toFixed(1)}%`} colorClass="border-purple-400" />
          <StatCard icon={<Star size={32} className="text-yellow-400" />} title="متوسط تقييم المستخدمين" value={`${avgUserRating.toFixed(1)}%`} colorClass="border-yellow-400" />
          <StatCard icon={<HeartHandshake size={32} className="text-green-400" />} title="توافق للقاء مجددًا" value={`${meetAgainRate.toFixed(1)}%`} colorClass="border-green-400" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <ChartContainer title="مقارنة دقة الخوارزمية">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreComparisonData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af' }} />
                  <YAxis tick={{ fill: '#9ca3af' }} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', color: '#e5e7eb' }} cursor={{ fill: 'rgba(107, 114, 128, 0.1)' }}/>
                  <Legend wrapperStyle={{ color: '#d1d5db' }} />
                  <Bar dataKey="System Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="User Rating" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
          <ChartContainer title="نسبة الرغبة في لقاء آخر">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={meetAgainData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false} label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}>
                  <Cell key="cell-0" fill="#34d399" />
                  <Cell key="cell-1" fill="#4b5563" />
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}/>
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartContainer title="أهم عوامل التوافق (في التقييمات العالية)">
                <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="#374151" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#d1d5db', fontSize: 12 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 25]} tick={{ fill: 'none' }} axisLine={{ stroke: 'none' }} />
                        <Radar name="Avg Score" dataKey="A" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.6} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}/>
                    </RadarChart>
                </ResponsiveContainer>
            </ChartContainer>
            <div className="bg-slate-800/50 p-4 rounded-lg shadow-lg">
                <h3 className="text-lg font-bold text-cyan-200 mb-4 text-center">ملخص التقييمات</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between bg-green-900/30 p-3 rounded-md">
                        <div className="flex items-center gap-3">
                            <ThumbsUp className="text-green-400" />
                            <span className="font-semibold text-green-300">تقييمات عالية (&gt;=80%)</span>
                        </div>
                        <span className="text-2xl font-bold text-white">{highFeedbackCount}</span>
                    </div>
                    <div className="flex items-center justify-between bg-red-900/30 p-3 rounded-md">
                        <div className="flex items-center gap-3">
                            <ThumbsDown className="text-red-400" />
                            <span className="font-semibold text-red-300">تقييمات منخفضة (&lt;=50%)</span>
                        </div>
                        <span className="text-2xl font-bold text-white">{lowFeedbackCount}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Recommendations */}
        <div className="bg-slate-800/50 border border-cyan-400/20 p-4 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <Lightbulb className="text-cyan-300" />
            <h3 className="text-xl font-bold text-cyan-200">توصيات لتحسين الخوارزمية</h3>
          </div>
          <ul className="space-y-2 text-slate-300 list-disc pr-5">
            {recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
          </ul>
        </div>

      </div>
    </div>
  );
}